import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const enabled = process.env.TIANWEN_DSH_MIGRATION_PROFILE === '1'

describe('Tianwen Runtime Bundle Profile', () => {
  it('keeps the real migration Profile gate opt-in', () => {
    expect(existsSync(resolve(root, 'scripts/verify-dsh-profile.mjs'))).toBe(true)
  })

  it.runIf(enabled)('installs and imports the Runtime Bundle through public DSH', () => {
    const result = spawnSync(process.execPath, [
      resolve(root, 'scripts/verify-dsh-profile.mjs'),
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TIANWEN_DSH_MIGRATION_PROFILE: '1' },
      shell: false,
      timeout: 120_000,
    })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    const report = JSON.parse(readFileSync(
      'D:/DevData/tianwen-dsh-probe/migration-profile-report.json',
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
      supportedDshVersion: '0.1.0-rc.6',
      externalSpecifiers: ['@deepseek-ai/cordis'],
    })
    expect(report.forbiddenEffects).toEqual({
      interactiveAppStarts: 0,
      modelRequests: 0,
      paidModelRequests: 0,
      liveWebRequests: 0,
      dockerInvocations: 0,
    })
  }, 120_000)
})
