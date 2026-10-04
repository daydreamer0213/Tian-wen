import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('DEV one-shot runner engineering checks use the public effect lifecycle', () => {
  const result = JSON.parse(execFileSync(process.execPath, [resolve('scripts/test-fixtures/development-native-job-runner-engineering-entry.mjs')], {
    cwd: resolve('.'), encoding: 'utf8', timeout: 15000,
  }))
  expect(result.engineeringOnly).toBe(true)
  expect(result.originalAcceptanceUnchanged).toBe(true)
  expect(result.passed).toHaveLength(21)
})
