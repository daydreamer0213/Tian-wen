import assert from 'node:assert/strict'
import {gzipSync} from 'node:zlib'

// Engineering fixture only. Never rewrites a frozen natural Task or its verdict.
export function prepareGoalRoutingCaseBatch(rows, outputLimitBytes) {
  assert(Number.isSafeInteger(outputLimitBytes) && outputLimitBytes > 0)
  for (const row of rows) {
    assert.equal(row.expected.id, row.id)
    if (row.id === 'material-string') assert.equal(typeof row.material, 'string', 'Malformed string control must contain an actual string')
  }
  const expectedJson = JSON.stringify(rows.map(row => row.expected))
  assert(Buffer.byteLength(expectedJson + '\n') <= outputLimitBytes, 'Original observation output exceeds the fixed executor budget; split before model launch')
  const input = JSON.stringify({encoding:'gzip-base64',payload:gzipSync(Buffer.from(JSON.stringify(rows.map(({expected,...row}) => row)))).toString('base64')})
  return {input, expectedJson}
}
