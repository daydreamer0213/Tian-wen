import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {expect,it} from 'vitest'
import {formatDevelopmentNativeArchiveStatus} from '../../scripts/development-native-archive-status.mjs'

const cases=JSON.parse(gunzipSync(readFileSync(resolve('tests/fixtures/archive-diagnostic-display.cases.json.gz'))).toString('utf8'))
const stable=(v: any): any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v
const freeze=(v: any): any=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)};return v}
for(const row of cases)it(`original frozen diagnostic display: ${row.id}`,()=>{
  const original=structuredClone(row),before=JSON.stringify(row)
  freeze(row.verification);freeze(row.summary);freeze(row.options)
  if(row.expected.error){expect(()=>formatDevelopmentNativeArchiveStatus(row.verification,row.summary,row.options)).toThrow(TypeError)}else{
    const first=formatDevelopmentNativeArchiveStatus(row.verification,row.summary,row.options),second=formatDevelopmentNativeArchiveStatus(row.verification,row.summary,row.options)
    expect(createHash('sha256').update(JSON.stringify(stable(second))).digest('hex')).toBe(row.expected.statusDigest)
    expect(first).not.toBe(second)
    if(first.diagnostics){expect(first.diagnostics).not.toBe(second.diagnostics);expect(first.diagnostics.items).not.toBe(second.diagnostics.items);expect(first.diagnostics.items[0]).not.toBe(second.diagnostics.items[0]);first.diagnostics.items[0].detail='caller changed display'}
    expect(formatDevelopmentNativeArchiveStatus(row.verification,row.summary,row.options)).toEqual(second)
  }
  expect(JSON.stringify(row)).toBe(before);expect(row).toEqual(original)
})
