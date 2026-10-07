import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
const rows = JSON.parse(gunzipSync(Buffer.from(JSON.parse(readFileSync(0,'utf8')).payload,'base64')))
const target = fileURLToPath(new URL('../../scripts/summarize-learning-status.mjs',import.meta.url))
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value==='object'
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value
const results = rows.map(row => {
  const result = spawnSync(process.execPath,[target],{input:row.raw??JSON.stringify(row.input),encoding:'utf8',timeout:2500,maxBuffer:65536})
  let outputDigest=null
  try { outputDigest=createHash('sha256').update(JSON.stringify(stable(JSON.parse(result.stdout)))).digest('hex') } catch {}
  return {id:row.id,exitCode:result.status,signal:result.signal,stderrEmpty:result.stderr==='',outputDigest,sourceWithinLimit:readFileSync(target).length<=20000}
})
console.log(JSON.stringify(results))
