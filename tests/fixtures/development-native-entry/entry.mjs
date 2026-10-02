import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {resolve} from 'node:path'
const root=new URL('../../../',import.meta.url)
registerHooks({resolve(specifier,context,next){return next(specifier==='@tianwen/evolution'?new URL('packages/tianwen-evolution/src/conversation-files.ts',root).href:specifier,context)}})
const {createDevelopmentNativeFilePolicy}=await import(new URL('scripts/development-native-file-policy.mjs',root))
const {summarizeDevelopmentNativeTask}=await import(new URL('scripts/development-native-task-result.mjs',root))
const cwd=resolve(process.env.TIANWEN_POLICY_CASE_ROOT||'/workspace/tianwen'),sessionId='owned-task'
const config=()=>({cwd,sessionId,outputPaths:['first.mjs','dir/second.mjs'],referencePaths:['contract.md'],maxTargetBytes:20})
const operation=(name,file_path,extra={})=>({name,sessionId,callId:'call',rootCallId:'call',arguments:{file_path,...extra}})
const allowed=value=>assert.equal(value,undefined)
const denied=value=>assert(typeof value==='string'&&value.trim().length>0)
let reads=0
const guard=createDevelopmentNativeFilePolicy(config(),path=>{reads++;assert.equal(path,resolve(cwd,'first.mjs'));return 'hello world'})
for(const path of ['first.mjs','dir/second.mjs','contract.md',resolve(cwd,'contract.md')])allowed(guard(operation('read',path)))
allowed(guard(operation('write','first.mjs',{content:''})))
allowed(guard(operation('write',resolve(cwd,'dir/second.mjs'),{content:'x'.repeat(20)})))
for(const change of [operation('write','contract.md',{content:'no'}),operation('edit','contract.md',{old_string:'x',new_string:'y'}),operation('read','outside.md'),operation('write','../outside.md',{content:'no'}),operation('write','first.mjs',{content:'x'.repeat(21)}),operation('write','first.mjs',{content:4}),operation('execute','first.mjs'),{...operation('read','first.mjs'),sessionId:'other'},{...operation('read','first.mjs'),parent:{}},{...operation('read','first.mjs'),parent:null},{...operation('read','first.mjs'),rootCallId:'other'},{...operation('read','first.mjs'),callId:''},{...operation('read','first.mjs'),arguments:null},{...operation('read','first.mjs'),arguments:[]},operation('read',4)])denied(guard(change))
assert.equal(reads,0,'readonly and denied permissions must not inspect output contents')
allowed(guard(operation('edit','first.mjs',{old_string:'world',new_string:'there'})))
assert.equal(reads,1)
const mutations=[operation('edit','first.mjs',{old_string:'',new_string:'x'}),operation('edit','first.mjs',{old_string:'missing',new_string:'x'}),operation('edit','first.mjs',{old_string:'hello',new_string:4}),operation('edit','first.mjs',{old_string:'hello',new_string:'x',replace_all:1}),operation('edit','first.mjs',{old_string:'hello',new_string:'x'.repeat(20)})]
for(const change of mutations)denied(guard(change))
const repeat=createDevelopmentNativeFilePolicy(config(),()=> 'x-x-x')
denied(repeat(operation('edit','first.mjs',{old_string:'x',new_string:'y'})))
allowed(repeat(operation('edit','first.mjs',{old_string:'x',new_string:'y',replace_all:true})))
denied(repeat(operation('edit','first.mjs',{old_string:'z',new_string:'y',replace_all:true})))
for(const content of [null,undefined,5,'x'.repeat(21)])denied(createDevelopmentNativeFilePolicy(config(),()=>content)(operation('edit','first.mjs',{old_string:'x',new_string:'y'})))
denied(createDevelopmentNativeFilePolicy(config(),()=>{throw new Error('unavailable')})(operation('edit','first.mjs',{old_string:'x',new_string:'y'})))
const unicode=createDevelopmentNativeFilePolicy({...config(),maxTargetBytes:4},()=> '界x')
denied(unicode(operation('edit','first.mjs',{old_string:'x',new_string:'界'})))
allowed(unicode(operation('edit','first.mjs',{old_string:'界',new_string:'好'})))
const literal=createDevelopmentNativeFilePolicy({...config(),maxTargetBytes:5},()=> 'a x b')
for(const new_string of ['$&','$$',"$'",'$`'])denied(literal(operation('edit','first.mjs',{old_string:'x',new_string})))
allowed(literal(operation('edit','first.mjs',{old_string:'x',new_string:'',replace_all:false})))
const mutable=config(),frozen=createDevelopmentNativeFilePolicy(mutable,()=> 'hello')
mutable.outputPaths.push('secret.mjs');mutable.referencePaths.push('other.md');mutable.maxTargetBytes=100
denied(frozen(operation('write','secret.mjs',{content:'secret'})));denied(frozen(operation('read','other.md')));denied(frozen(operation('write','first.mjs',{content:'x'.repeat(21)})))
for(const invalid of [{...config(),cwd:'relative'},{...config(),sessionId:''},{...config(),outputPaths:[]},{...config(),outputPaths:['a.mjs','a.mjs']},{...config(),outputPaths:['A.mjs','a.mjs']},{...config(),referencePaths:['first.mjs']},{...config(),outputPaths:['../a.mjs']},{...config(),outputPaths:['bad\ud800.mjs']},{...config(),maxTargetBytes:0},{...config(),maxTargetBytes:98305},{...config(),maxTargetBytes:1.5}])assert.throws(()=>createDevelopmentNativeFilePolicy(invalid,()=> ''))
assert.throws(()=>createDevelopmentNativeFilePolicy(config(),null))
const withParent=operation('read','first.mjs');const before=JSON.stringify(withParent);allowed(guard(withParent));assert.equal(JSON.stringify(withParent),before)
if(process.platform==='win32')allowed(guard(operation('write',resolve(cwd,'DIR\\SECOND.MJS'),{content:'yes'})))
else denied(guard(operation('write','DIR/SECOND.MJS',{content:'yes'})))
const expected=['first.mjs','dir/second.mjs']
const baseTask={source:{taskId:'original-task'},completion:{status:'completed',files:{outputPaths:[...expected]}},externalCheckPrepared:{checkerId:'original-check'},externalCheckFinished:{status:'verified'},review:{verdict:'met'}}
const summary=(task=baseTask)=>summarizeDevelopmentNativeTask(task,expected)
const pass={taskId:'original-task',completionStatus:'completed',functionalStatus:'verified',reviewVerdict:'met',permissionSetExact:true,functionalCandidateVerified:true}
assert.deepEqual(summary(),pass)
assert.deepEqual(summary({...baseTask,completion:{...baseTask.completion,files:{outputPaths:[...expected].reverse()}}}),pass)
for(const paths of [['first.mjs'],['first.mjs','first.mjs'],[...expected,'contract.md'],['FIRST.mjs','dir/second.mjs']])assert.deepEqual(summary({...baseTask,completion:{...baseTask.completion,files:{outputPaths:paths}}}),{...pass,permissionSetExact:false,functionalCandidateVerified:false})
for(const status of ['rejected','unverifiable'])assert.deepEqual(summary({...baseTask,externalCheckFinished:{status}}),{...pass,functionalStatus:status,functionalCandidateVerified:false})
const {externalCheckPrepared:_prepared,...noPreparation}=baseTask
assert.deepEqual(summary(noPreparation),{...pass,functionalCandidateVerified:false})
const {externalCheckFinished:_finished,...noResult}=baseTask
assert.deepEqual(summary(noResult),{...pass,functionalStatus:null,functionalCandidateVerified:false})
assert.deepEqual(summary({...baseTask,externalCheckInvalidated:{kind:'task-external-check-invalidated'}}),{...pass,functionalCandidateVerified:false})
assert.deepEqual(summary({...baseTask,completion:{...baseTask.completion,status:'failed'}}),{...pass,completionStatus:'failed',functionalCandidateVerified:false})
assert.deepEqual(summary({...baseTask,review:{verdict:'inconclusive'}}),{...pass,reviewVerdict:'inconclusive'})
assert.deepEqual(summarizeDevelopmentNativeTask(undefined,expected),{taskId:null,completionStatus:null,functionalStatus:null,reviewVerdict:null,permissionSetExact:false,functionalCandidateVerified:false})
assert.deepEqual(summary({...baseTask,completion:{status:'completed'}}),{...pass,permissionSetExact:false,functionalCandidateVerified:false})
for(const paths of [[],['x','x'],['x',4]])assert.throws(()=>summarizeDevelopmentNativeTask(baseTask,paths))
const beforeTask=JSON.stringify(baseTask),beforeExpected=JSON.stringify(expected);summary();assert.equal(JSON.stringify(baseTask),beforeTask);assert.equal(JSON.stringify(expected),beforeExpected)
console.log(JSON.stringify({passed:true}))
