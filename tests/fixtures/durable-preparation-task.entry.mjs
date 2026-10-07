import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {isDevelopmentNativePreparationCommitted} from '../../scripts/development-prepared-task-gate.mjs'
const frame=JSON.parse(readFileSync(0,'utf8'))
const cases=JSON.parse(gunzipSync(Buffer.from(frame.payload,'base64')).toString('utf8'))
const results=cases.map(row=>{
 const before=JSON.stringify(row)
 const prepared=isDevelopmentNativePreparationCommitted(row.tasks,row.options)
 return {id:row.id,prepared,boolean:typeof prepared==='boolean',unchanged:before===JSON.stringify(row)}
})
process.stdout.write(JSON.stringify(results))
