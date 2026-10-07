import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
const rows=JSON.parse(gunzipSync(Buffer.from(JSON.parse(readFileSync(0,'utf8')).payload,'base64')))
const target=fileURLToPath(new URL('../../scripts/summarize-learning-status.mjs',import.meta.url))
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v
const digest=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')
const results=rows.map(row=>{
 const result=spawnSync(process.execPath,[target,...(row.args??[])],{input:row.raw??JSON.stringify(row.input),encoding:'utf8',timeout:2500,maxBuffer:65536})
 let outputDigest=null;try{outputDigest=digest(JSON.parse(result.stdout))}catch{}
 return {id:row.id,exitCode:result.status,signal:result.signal,stderrEmpty:result.stderr==='',outputDigest,sourceWithinLimit:readFileSync(target).length<=20000}
})
console.log(JSON.stringify({caseCount:results.length,digest:digest(results)}))
