import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { gunzipSync, gzipSync } from 'node:zlib'
import { expect, it } from 'vitest'

const rows = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/ordinary-contract-routing.cases.json.gz', import.meta.url))))
let results: unknown[] | undefined
function actualResults() {
  if (results) return results
  const response = spawnSync(process.execPath, ['tests/fixtures/ordinary-contract-routing.entry.mjs'], {
    cwd: new URL('../..', import.meta.url), encoding: 'utf8',
    input: JSON.stringify({ payload: gzipSync(Buffer.from(JSON.stringify(rows.map(({expected,...row}) => row)))).toString('base64') }),
  })
  expect(response.status).toBe(0)
  expect(response.stderr).toBe('')
  results = JSON.parse(response.stdout)
  expect(results).toHaveLength(rows.length)
  return results
}
it.each(rows.map((row: any,index: number) => [row.id,index,row.expected]))('frozen ordinary task contract: %s', (_id,index,expected) => {
  expect(actualResults()[index]).toEqual(expected)
})
