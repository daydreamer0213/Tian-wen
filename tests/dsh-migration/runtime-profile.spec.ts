import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertNoRuntimeForbiddenReferences } from '../../scripts/verify-dsh-profile.mjs'

const root = resolve(import.meta.dirname, '../..')
const enabled = process.env.TIANWEN_DSH_MIGRATION_PROFILE === '1'
const probeRoot = 'D:/DevData/tianwen-dsh-probe'
const migrationReport = `${probeRoot}/migration-profile-report.json`
const profileReport = `${probeRoot}/profile-report.json`

function verify(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [resolve(root, 'scripts/verify-dsh-profile.mjs')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, TIANWEN_DSH_PROBE_ROOT: probeRoot, ...env }, shell: false, timeout: 240_000,
  })
}

describe('Tianwen Runtime Bundle Profile', () => {
  it('keeps the real migration Profile gate opt-in', () => {
    expect(existsSync(resolve(root, 'scripts/verify-dsh-profile.mjs'))).toBe(true)
  })

  it('rejects forbidden references in full Runtime manifest and metafile', () => {
    expect(() => assertNoRuntimeForbiddenReferences(['{"optionalDependencies":{"probe":"@tianwen/dsh-probe-bundle/adapter"}}'])).toThrow()
    expect(() => assertNoRuntimeForbiddenReferences(['{"inputs":{"probe/adapter.ts":{}}}'])).toThrow()
  })

  it.runIf(enabled)('invalidates a stale migration report before root validation', () => {
    writeFileSync(migrationReport, '{"stale":true}\n')
    const result = verify({
      TIANWEN_DSH_MIGRATION_PROFILE: '1',
      TIANWEN_DSH_PROBE_ROOT: '',
    })
    expect(result.status).toBe(1)
    expect(existsSync(migrationReport)).toBe(false)
  })

  it.runIf(enabled)('invalidates a stale migration report before early setup failure', () => {
    writeFileSync(migrationReport, '{"stale":true}\n')
    const result = verify({ TIANWEN_DSH_MIGRATION_PROFILE: '1', COREPACK_HOME: 'D:/DevData/missing-corepack' })
    expect(result.status).not.toBe(0)
    expect(existsSync(migrationReport)).toBe(false)
  })

  it.runIf(enabled)('installs and imports the Runtime Bundle through public DSH', () => {
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
      supportedDshVersion: '0.1.0-rc.7',
      externalSpecifiers: ['@deepseek-ai/cordis'],
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
      files: ['cordis.patch.yml', 'dist/index.d.ts', 'dist/index.js', 'dist/runtime.js', 'package.json'],
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
