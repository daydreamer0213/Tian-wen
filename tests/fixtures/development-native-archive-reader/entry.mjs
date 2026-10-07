import assert from 'node:assert/strict'
import {readDevelopmentNativeArchiveEntries as read} from '../../../scripts/development-native-archive-reader.mjs'
const names=['attempt-started.json','task.json','root-native.json.gz','result.json','failure.json','cleanup.json']
const view=new Uint8Array([99,1,2,88]).subarray(1,3),data={'attempt-started.json':'中','root-native.json.gz':view,'result.json':''},calls=[]
const out=await read(async name=>{calls.push(name);return Object.hasOwn(data,name)?data[name]:null},{signal:new AbortController().signal,maxBytes:5})
assert.deepEqual(calls,names);assert.deepEqual(out,[{path:names[0],content:new Uint8Array(Buffer.from('中'))},{path:names[2],content:new Uint8Array([1,2])},{path:names[3],content:new Uint8Array()}]);out[1].content[0]=44;assert.deepEqual(view,new Uint8Array([1,2]))
let count=0;await assert.rejects(read(async()=>{count++;return 'xx'},{signal:new AbortController().signal,maxBytes:3}),RangeError);assert.equal(count,2)
const controller=new AbortController(),reason=new Error('original cancellation');count=0;await assert.rejects(read(async()=>{count++;controller.abort(reason);return 'x'},{signal:controller.signal,maxBytes:10}),e=>e===reason);assert.equal(count,1)
count=0;await assert.rejects(read(async()=>{count++;return 'x'},{signal:controller.signal,maxBytes:10}),e=>e===reason);assert.equal(count,0)
for(const bad of [undefined,0,-1,1.5,Number.MAX_SAFE_INTEGER+1]){count=0;await assert.rejects(read(async()=>{count++;return null},{signal:new AbortController().signal,maxBytes:bad}),TypeError);assert.equal(count,0)}
count=0;await assert.rejects(read(async()=>{count++;return null},{signal:{},maxBytes:10}),TypeError);assert.equal(count,0)
await assert.rejects(read(null,{signal:new AbortController().signal,maxBytes:10}),TypeError)
for(const bad of ['\ud800',{},new Uint16Array([42]),new DataView(new ArrayBuffer(2))]){count=0;await assert.rejects(read(async()=>{count++;return bad},{signal:new AbortController().signal,maxBytes:10}),TypeError);assert.equal(count,1)}
const failure=new Error('original read error');count=0;await assert.rejects(read(async()=>{count++;throw failure},{signal:new AbortController().signal,maxBytes:10}),e=>e===failure);assert.equal(count,1)
assert.deepEqual(await read(async()=>null,{signal:new AbortController().signal,maxBytes:1}),[])
console.log(JSON.stringify({passed:true}))
