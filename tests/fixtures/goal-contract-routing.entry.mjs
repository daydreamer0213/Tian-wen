import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {isDeepStrictEqual} from 'node:util'
import {createDevelopmentGoalTaskCheck} from '../../scripts/development-goal-task-check.mjs'
const envelope=JSON.parse(readFileSync(0,'utf8'))
const rows=JSON.parse(gunzipSync(Buffer.from(envelope.payload,'base64'))),results=[]
for(const row of rows){
 const config=structuredClone(row.config),material=structuredClone(row.material),constructors=[],calls=[],checks=[]
 const marker=new Error('Original owner failure'),snapshot=JSON.stringify(config),originalContracts=structuredClone(Array.isArray(config)?config:[config])
 let exactMaterial=true,thisBinding=true,returnedIdentity=true,factoryFieldsComplete=true
 const factory=row.invalidFactory?null:contract=>{
  factoryFieldsComplete&&=isDeepStrictEqual(contract,originalContracts[constructors.length]);constructors.push(contract)
  if(row.factoryThrows)throw marker
  const owner={scope:{token:contract.token},prepared:{checkerId:contract.token}}
  const record=(kind,actual,receiver)=>{calls.push(kind+':'+contract.token);exactMaterial&&=actual===material;thisBinding&&=receiver===owner}
  owner.prepare=row.badPrepare?undefined:function(actual){
   record('prepare',actual,this);if(row.prepareThrows)throw marker
   if(row.cancelled)actual.signal.throwIfAborted()
   return row.prepareUndefined?undefined:Promise.resolve(owner.prepared)
  }
  if(!row.omitScope)owner.methodScope=row.badScope?42:function(actual){
   record('scope',actual,this);if(row.scopeThrows)throw marker
   if(row.cancelled)actual.signal.throwIfAborted()
   return row.scopeUndefined?undefined:owner.scope
  }
  checks.push(owner);return owner
 }
 try{
  const router=createDevelopmentGoalTaskCheck(config,factory),unchangedAtConstruction=JSON.stringify(config)===snapshot
  if(row.mutate){const first=Array.isArray(config)?config[0]:config;first.requestText='changed';first.goalCommand='changed';first.token='changed';first.nested.value='changed';if(Array.isArray(config))config.reverse()}
  if(row.cancelled){const controller=new AbortController();controller.abort(marker);material.signal=controller.signal}
  const materialSnapshot=JSON.stringify(material)
  const scope=await router.methodScope(material),prepared=await router.prepare(material)
  if(scope!==undefined)returnedIdentity&&=checks.some(check=>check.scope===scope)
  if(prepared!==undefined)returnedIdentity&&=checks.some(check=>check.prepared===prepared)
  results.push({id:row.id,constructors:constructors.map(c=>c.token),nested:constructors.map(c=>c.nested?.value),calls,
   scope:scope?.token??null,selected:prepared?.checkerId??null,exactMaterial,thisBinding,returnedIdentity,factoryFieldsComplete,unchangedAtConstruction,materialUnchanged:JSON.stringify(material)===materialSnapshot})
 }catch(error){results.push({id:row.id,error:error===marker?'original-error':error.name,constructors:constructors.map(c=>c.token),calls,factoryFieldsComplete,originalError:error===marker||error instanceof TypeError})}
}
console.log(JSON.stringify(results))
