import { expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

it('native archive corruption regressions also run through the standard test entry', () => {
  execFileSync(process.execPath, ['--test', resolve('tests/dsh-migration/development-native-archive-seal.spec.mjs')], { cwd: resolve('.'), encoding: 'utf8', timeout: 15000 })
})

it('original archive reader oracle also runs through the standard test entry', () => {
  const result = spawnSync(process.execPath, [resolve('tests/fixtures/development-native-archive-reader/entry.mjs')], { cwd: resolve('.'), encoding: 'utf8', timeout: 15000 })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout)).toEqual({ passed: true })
})

// Native Node hooks must run in Node itself, outside Vitest's module resolver.
for (const scenario of ['peer', 'original', 'permissions', 'file-guard', 'flush-error', 'cancel', 'review-cancel', 'prior-session', 'rerun', 'durable-session', 'live-session', 'stale-task', 'stale-native', 'stale-seal', 'stale-seal-failure', 'seal-write-error', 'seal-prior-error', 'archive-limit-invalid', 'archive-limit', 'archive-limit-prior-error'] as const) {
  it(`actual DEV host: ${scenario}`, () => {
    const result = execFileSync(process.execPath, ['--import', 'tsx', resolve('tests/fixtures/development-native-host-control/entry.mjs'), scenario], { cwd: resolve('.'), encoding: 'utf8', timeout: 15000 })
    expect(JSON.parse(result)).toEqual({ passed: true, scenario, modelRequests: 0 })
  })
}
