import { expect,it } from 'vitest'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
const rows=JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/learning-overview-report.cases.json.gz',import.meta.url))))
 .filter((r:any)=>r.id.startsWith('overview/'))
const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v
const digest=(v:any)=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')
it.each(rows.map((r:any)=>[r.id,r]))('frozen optional Chinese overview: %s',(_id,row:any)=>{
 const r=spawnSync(process.execPath,['scripts/summarize-learning-status.mjs',...(row.args??[])],{input:row.raw??JSON.stringify(row.input),encoding:'utf8',timeout:2500})
 let outputDigest=null;try{outputDigest=digest(JSON.parse(r.stdout))}catch{}
 expect({id:row.id,exitCode:r.status,signal:r.signal,stderrEmpty:r.stderr==='',outputDigest,sourceWithinLimit:readFileSync('scripts/summarize-learning-status.mjs').length<=20000}).toEqual(row.expected)
})
