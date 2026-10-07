import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { gunzipSync, gzipSync } from 'node:zlib'

const rows = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/learning-goal-report.cases.json.gz',import.meta.url))))
  .filter((row: any) => row.id.startsWith('goal/'))
let cached: any[] | undefined
function results() {
  if (cached) return cached
  const response = spawnSync(process.execPath,['tests/fixtures/learning-source-report.entry.mjs'],{
    cwd:new URL('../..',import.meta.url),encoding:'utf8',timeout:20_000,
    input:JSON.stringify({payload:gzipSync(Buffer.from(JSON.stringify(rows.map(({expected,...row}:any)=>row)))).toString('base64')}),
  })
  expect(response.status).toBe(0);expect(response.stderr).toBe('')
  cached=JSON.parse(response.stdout);expect(cached).toHaveLength(rows.length)
  return cached!
}
it.each(rows.map((row:any,index:number)=>[row.id,index,row.expected]))('frozen original-Goal report: %s',(_id,index,expected)=>{
  expect(results()[index]).toEqual(expected)
})
