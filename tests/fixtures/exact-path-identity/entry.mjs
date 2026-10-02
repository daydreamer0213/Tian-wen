import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {mkdirSync,mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const root=new URL('../../../',import.meta.url)
registerHooks({resolve(specifier,context,next){return next(specifier==='@tianwen/evolution'?new URL('packages/tianwen-evolution/src/conversation-files.ts',root).href:specifier,context)}})
const {parseConversationFileEntries,parseConversationFileResult,CONVERSATION_FILE_MAX_ENTRY_BYTES}=await import(new URL('packages/tianwen-evolution/src/conversation-files.ts',root))
const {conversationFilePath,readConversationFile,seedConversationFiles}=await import(new URL('packages/tianwen-runtime-bundle/src/conversation-file-material.ts',root))
const {sha256}=await import(new URL('packages/tianwen-evolution/src/learning-intake.ts',root))
const malformed=['bad\ud800.ts','bad\ud801.ts','bad\udfff.ts','bad\udc00.ts','\ud800/b.ts','a/\udc00.ts','a\ud800\ud800.ts','a\udc00\udc00.ts','😀\ud800.ts','a\ud800z.ts','a\udc00z.ts']
for(const path of malformed) assert.throws(()=>parseConversationFileEntries([{path,content:null}]),'malformed captured path accepted')
assert.throws(()=>parseConversationFileEntries([{path:malformed[0],content:'one'},{path:malformed[1],content:'two'}]),'colliding encoded paths accepted')
const parent=process.env.TIANWEN_PATH_TEST_ROOT||'/tmp'
mkdirSync(parent,{recursive:true})
const directory=mkdtempSync(resolve(parent,'tianwen-exact-path-'))
try {
  const missing=resolve(directory,'does-not-exist')
  for(const path of malformed) for(const candidate of [path,resolve(directory,path)]) {
    let failure
    try {await conversationFilePath(missing,candidate)} catch(error){failure=error}
    assert(failure,'malformed runtime path accepted')
    assert.notEqual(failure.code,'ENOENT','filesystem was reached before candidate rejection')
  }
  await assert.rejects(conversationFilePath(missing,'valid.ts'),{code:'ENOENT'})
  const paths=['中文/功能.ts','emoji-😀.ts','literal-�.ts','BOM-\ufeff.ts','百分号%20.ts','space name.ts','é.ts']
  const entries=paths.map((path,index)=>({path,content:`value ${index}\n`}))
  assert.deepEqual(parseConversationFileEntries(entries),entries)
  await seedConversationFiles(directory,entries)
  for(const entry of entries){assert.equal(await conversationFilePath(directory,entry.path),entry.path);assert.deepEqual(await readConversationFile(directory,entry.path),entry);assert.equal(readFileSync(resolve(directory,entry.path),'utf8'),entry.content)}
  assert.equal((await readConversationFile(directory,'new-valid-😀.ts')).content,null)
  await assert.rejects(seedConversationFiles(directory,entries))
  await assert.rejects(conversationFilePath(directory,'../escape.ts'))
  for(const paths of [['A.ts','a.ts'],['A/x.ts','a/y.ts'],['a','a/b.ts']]) assert.throws(()=>parseConversationFileEntries(paths.map(path=>({path,content:null}))))
  for(const path of ['e\u0301.ts','CON.ts','a\\b.ts','a/../b.ts','a/.ts.']) assert.throws(()=>parseConversationFileEntries([{path,content:null}]))
  assert.throws(()=>parseConversationFileEntries([{path:'valid.ts',content:'\ud800'}]))
  assert.throws(()=>parseConversationFileEntries([{path:'valid.ts',content:'x'.repeat(CONVERSATION_FILE_MAX_ENTRY_BYTES+1)}]))
  const result={schemaVersion:'tianwen.conversation-file-result.v1',outputKind:'files',inputsDigest:sha256(entries),captureSeq:1,outputPaths:[paths[0]],entries}
  assert.deepEqual(parseConversationFileResult(result),result)
  writeFileSync(resolve(directory,'new-valid-😀.ts'),'new')
  assert.deepEqual(await readConversationFile(directory,'new-valid-😀.ts'),{path:'new-valid-😀.ts',content:'new'})
} finally {rmSync(directory,{recursive:true})}
console.log(JSON.stringify({passed:true}))
