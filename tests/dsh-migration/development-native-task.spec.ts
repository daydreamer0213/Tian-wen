import { expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { relative, sep } from 'node:path'

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

it('original archive status oracle also runs through the standard test entry', () => {
  const result = spawnSync(process.execPath, [resolve('tests/fixtures/development-native-archive-status/entry.mjs')], { cwd: resolve('.'), encoding: 'utf8', timeout: 15000 })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout)).toEqual({ passed: true })
})

it('readonly archive inspection controls run through the standard test entry', () => {
  execFileSync(process.execPath, ['--import', 'tsx', '--test', resolve('tests/dsh-migration/development-native-archive-inspect.spec.mjs')], { cwd: resolve('.'), encoding: 'utf8', timeout: 15000 })
})

// Native Node hooks must run in Node itself, outside Vitest's module resolver.
for (const scenario of ['peer', 'original', 'permissions', 'file-guard', 'missing-native-provenance', 'wrong-native-provenance', 'flush-error', 'cancel', 'review-cancel', 'prior-session', 'rerun', 'durable-session', 'live-session', 'stale-task', 'stale-native', 'stale-seal', 'stale-seal-failure', 'seal-write-error', 'seal-prior-error', 'archive-limit-invalid', 'archive-limit', 'archive-limit-prior-error'] as const) {
  it(`actual DEV host: ${scenario}`, () => {
    const result = execFileSync(process.execPath, ['--import', 'tsx', resolve('tests/fixtures/development-native-host-control/entry.mjs'), scenario], { cwd: resolve('.'), encoding: 'utf8', timeout: 15000 })
    expect(JSON.parse(result)).toEqual({ passed: true, scenario, modelRequests: 0 })
  })
}

it.runIf(process.platform === 'win32').each([false, true])('published SDK retains original overflow diagnostics and literal permission paths (templates=%s)', templates => {
  const base = resolve(process.platform === 'win32' ? 'D:/DevData/tianwen-host-diagnostic-tests' : '/tmp/tianwen-host-diagnostic-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(resolve(base, 'native-diagnostic-'))
  const env = { ...process.env, TIANWEN_NATIVE_DIAGNOSTIC_CONTROL_ROOT: root.replaceAll('\\', '/'), TIANWEN_NATIVE_DIAGNOSTIC_CONTROL_BRACES: templates ? '1' : '0' }
  try {
    for (const mode of ['--run', '--cold']) {
      const result = execFileSync(process.execPath, ['--import', 'tsx', resolve('tests/fixtures/development-native-host-control/diagnostics.mjs'), mode], { cwd: resolve('.'), env, encoding: 'utf8', timeout: 15000 })
      expect(JSON.parse(result)).toEqual({ mode, scriptedRequests: mode === '--run' ? 21 : 0, preparations: mode === '--run' ? 1 : 0, evaluations: 0, originalFailurePreserved: true, diagnosticChecked: true })
    }
  } finally {
    const descendant = relative(realpathSync(base), realpathSync(root))
    if (!descendant.startsWith('native-diagnostic-') || descendant.includes(sep)) throw new Error('unexpected diagnostic cleanup path')
    rmSync(root, { recursive: true, force: true })
  }
})
