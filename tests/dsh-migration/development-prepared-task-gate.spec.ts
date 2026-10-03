import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { isDevelopmentNativePreparationCommitted } from '../../scripts/development-prepared-task-gate.mjs'

// Frozen before the first candidate. Derived from scripted SDK first/later request
// states, not natural feedback, learned guidance or a regrade of the archived Task.
const cases = JSON.parse(gunzipSync(readFileSync(resolve('tests/fixtures/durable-preparation-task.cases.json.gz'))).toString('utf8'))
for (const row of cases) {
  it(`original durable preparation: ${row.id}`, () => {
    const before = structuredClone(row)
    expect(isDevelopmentNativePreparationCommitted(row.tasks, row.options)).toBe(row.expected)
    expect(row).toEqual(before)
  })
}
