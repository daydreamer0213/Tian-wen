import { formatDevelopmentNativeArchiveStatus } from '../../scripts/development-native-archive-status.mjs'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
function freeze(value) {
  if(value && typeof value==='object') { Object.values(value).forEach(freeze);Object.freeze(value) }
  return value
}
function stable(value) {
  if(Array.isArray(value))return value.map(stable)
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]))
  return value
}
const input=JSON.parse(readFileSync(0,'utf8'))
const cases=JSON.parse(gunzipSync(Buffer.from(input.payload,'base64')))
const results=cases.map(({id,verification,summary,options})=>{
  const before=JSON.stringify({verification,summary,options})
  freeze(verification);freeze(summary);freeze(options)
  try {
    const status=formatDevelopmentNativeArchiveStatus(verification,summary,options)
    const second=formatDevelopmentNativeArchiveStatus(verification,summary,options)
    const fresh=status!==second && (!status.diagnostics || (status.diagnostics!==second.diagnostics && status.diagnostics.items!==second.diagnostics.items && status.diagnostics.items.every((item,i)=>item!==second.diagnostics.items[i])))
    if(status.diagnostics)status.diagnostics.items[0].detail='caller changed the returned display'
    const third=formatDevelopmentNativeArchiveStatus(verification,summary,options)
    return {id,statusDigest:createHash('sha256').update(JSON.stringify(stable(second))).digest('hex'),unchanged:JSON.stringify({verification,summary,options})===before,fresh,unpolluted:JSON.stringify(stable(third))===JSON.stringify(stable(second))}
  }catch(error){return{id,error:error.name,unchanged:JSON.stringify({verification,summary,options})===before}}
})
console.log(JSON.stringify(results))
