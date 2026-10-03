import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {sealDevelopmentNativeArchive as seal,verifyDevelopmentNativeArchiveSeal as verify} from '../../../scripts/development-native-archive-seal.mjs'
const names=['attempt-started.json','task.json','root-native.json.gz','result.json','failure.json','cleanup.json'],sid='original-native-session',version='tianwen.development-native-archive-seal.v1'
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const entries=names.filter(path=>path!=='failure.json').map((path,i)=>({path,content:i===2?new Uint8Array([31,139,0,255]):`original ${path} 中文🙂\r\n`}))
const expected={schemaVersion:version,sessionId:sid,files:entries.map(({path,content})=>{const b=typeof content==='string'?Buffer.from(content,'utf8'):Buffer.from(content);return {path,bytes:b.length,digest:digest(b)}}),complete:true}
const pass={sessionMatches:true,filesMatch:true,complete:true,missing:[],changed:[],added:[]}
const before=structuredClone(entries),s=seal(sid,[...entries].reverse());assert.deepEqual(s,expected);assert.deepEqual(entries,before);assert.deepEqual(verify(s,sid,[...entries].reverse()),pass)
const bytes=entries.map(({path,content})=>({path,content:typeof content==='string'?Buffer.from(content):content}));assert.deepEqual(verify(s,sid,bytes),pass)
const padded=new Uint8Array([99,88,31,139,0,255,77,66]),slice=padded.subarray(2,6),sliced=entries.map(e=>e.path===names[2]?{...e,content:slice}:e);assert.deepEqual(seal(sid,sliced),expected);assert.deepEqual(verify(s,sid,sliced),pass)
const empty=seal(sid,[]);assert.deepEqual(empty,{schemaVersion:version,sessionId:sid,files:[],complete:false});assert.deepEqual(verify(empty,sid,[]),{...pass,complete:false})
const partial=seal(sid,entries.filter(e=>e.path!==names[1]));assert.equal(partial.complete,false);assert.deepEqual(verify(partial,sid,entries.filter(e=>e.path!==names[1])),{...pass,complete:false})
const both=[...entries,{path:'failure.json',content:'original failure'}];assert.equal(seal(sid,both).complete,true)
const failureOnly=both.filter(e=>e.path!=='result.json');assert.equal(seal(sid,failureOnly).complete,true)
const noOutcome=entries.filter(e=>e.path!=='result.json');assert.equal(seal(sid,noOutcome).complete,false)
assert.deepEqual(verify(s,'another-session',entries),{...pass,sessionMatches:false,complete:false})
assert.deepEqual(verify(s,sid,entries.filter(e=>e.path!==names[0])),{...pass,filesMatch:false,complete:false,missing:[names[0]]})
assert.deepEqual(verify(s,sid,both),{...pass,filesMatch:false,complete:false,added:['failure.json']})
const changed=entries.map(e=>e.path===names[1]?{...e,content:'same name, other execution'}:e);assert.deepEqual(verify(s,sid,changed),{...pass,filesMatch:false,complete:false,changed:[names[1]]})
const combination=[...changed.filter(e=>e.path!==names[0]),{path:'failure.json',content:'extra'}].reverse();assert.deepEqual(verify(s,sid,combination),{...pass,filesMatch:false,complete:false,missing:[names[0]],changed:[names[1]],added:['failure.json']})
const spaced=' original-native-session ';assert.equal(seal(spaced,entries).sessionId,spaced);assert.equal(verify(seal(spaced,entries),sid,entries).sessionMatches,false)
for(const badSession of [null,0,'',' \n'])for(const fn of [()=>seal(badSession,entries),()=>verify(s,badSession,entries)])assert.throws(fn,TypeError)
for(const badEntries of [null,{},[{path:'other.json',content:'x'}],[entries[0],entries[0]],[{path:names[0],content:null}],[{path:names[0],content:new DataView(new ArrayBuffer(2))}],[{path:names[0],content:new Uint16Array([42])}],[{path:names[0],content:'\ud800'}],[{path:names[0],content:'\udfff'}],[{path:names[0],content:'x',extra:true}]])for(const fn of [()=>seal(sid,badEntries),()=>verify(s,sid,badEntries)])assert.throws(fn,TypeError)
for(const mutate of [v=>v.schemaVersion='other',v=>v.extra=true,v=>delete v.sessionId,v=>v.complete=false,v=>v.files.reverse(),v=>v.files.push({...v.files[0]}),v=>v.files[0].path='other.json',v=>v.files[0].bytes=-1,v=>v.files[0].bytes=Number.MAX_SAFE_INTEGER+1,v=>v.files[0].digest='sha256:wrong',v=>v.files[0].extra=true]){const invalid=structuredClone(s);mutate(invalid);assert.throws(()=>verify(invalid,sid,entries),TypeError)}
const sealBefore=structuredClone(s),inputBefore=structuredClone(entries),r=verify(s,sid,entries);r.changed.push('changed caller return');assert.deepEqual(s,sealBefore);assert.deepEqual(entries,inputBefore)
const res=seal(sid,entries);res.files[0].path='caller change';res.files.push({});assert.deepEqual(seal(sid,entries),expected)
console.log(JSON.stringify({passed:true}))
