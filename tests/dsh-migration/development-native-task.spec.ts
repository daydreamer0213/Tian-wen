import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

// Native Node hooks must run in Node itself, outside Vitest's module resolver.
for (const scenario of ['peer', 'original', 'permissions', 'file-guard', 'flush-error', 'cancel', 'review-cancel', 'prior-session', 'rerun', 'durable-session', 'live-session', 'stale-task', 'stale-native'] as const) {
  it(`actual DEV host: ${scenario}`, () => {
    const result = execFileSync(process.execPath, ['--import', 'tsx', resolve('tests/fixtures/development-native-host-control/entry.mjs'), scenario], { cwd: resolve('.'), encoding: 'utf8', timeout: 15000 })
    expect(JSON.parse(result)).toEqual({ passed: true, scenario, modelRequests: 0 })
  })
}
