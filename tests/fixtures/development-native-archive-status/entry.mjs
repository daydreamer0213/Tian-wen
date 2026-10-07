import assert from 'node:assert/strict'
import {formatDevelopmentNativeArchiveStatus as format} from '../../../scripts/development-native-archive-status.mjs'
const verification={sessionMatches:true,filesMatch:true,complete:true,missing:[],changed:[],added:[]},summary={taskId:'original',completionStatus:'completed',functionalStatus:'verified',reviewVerdict:'inconclusive',permissionSetExact:true,functionalCandidateVerified:true}
const expected={archive:'归档字节一致且文件集合完整',completion:'任务已结束',functional:'原程序检查记录：通过',review:'整体评审未定',disposition:'以上为原归档事实，不代表方法已采用或自动学习已完成。'}
assert.deepEqual(format(verification,summary),expected)
for(const [change,label] of [[{sessionMatches:false,complete:false},'会话不匹配'],[{filesMatch:false,complete:false,changed:['task.json']},'归档已变化'],[{complete:false},'归档文件不完整']])assert.deepEqual(format({...verification,...change},summary),{...expected,archive:label})
for(const [status,label] of [['completed','任务已结束'],['interrupted','任务中断'],['failed','执行失败'],[null,'任务状态缺失']])assert.deepEqual(format(verification,{...summary,completionStatus:status}),{...expected,completion:label})
for(const [status,label] of [['verified','原程序检查记录：通过'],['rejected','原程序检查记录：未通过'],['unverifiable','原程序检查记录：无法核验'],[null,'原程序尚无检查记录']])assert.deepEqual(format(verification,{...summary,functionalStatus:status}),{...expected,functional:label})
for(const [status,label] of [['met','整体评审通过'],['not-met','整体评审未通过'],['inconclusive','整体评审未定'],[null,'尚未整体评审']])assert.deepEqual(format(verification,{...summary,reviewVerdict:status}),{...expected,review:label})
assert.deepEqual(format(verification,{...summary,functionalCandidateVerified:false,permissionSetExact:false}),expected)
for(const invalid of [null,{...verification,extra:true},{...verification,complete:'true'},{...verification,sessionMatches:false},{...verification,missing:['task.json']},{...verification,changed:'wrong'}])assert.throws(()=>format(invalid,summary),TypeError)
for(const invalid of [null,{...summary,extra:true},{...summary,taskId:''},{...summary,completionStatus:'met'},{...summary,functionalStatus:'passed'},{...summary,reviewVerdict:true},{...summary,permissionSetExact:0},{...summary,functionalCandidateVerified:null}])assert.throws(()=>format(verification,invalid),TypeError)
const before=structuredClone({verification,summary});format(verification,summary);assert.deepEqual({verification,summary},before)
console.log(JSON.stringify({passed:true}))
