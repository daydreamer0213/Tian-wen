import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
const { conversationQualityContract, sha256 } = await import(pathToFileURL(require.resolve('@tianwen/evolution')).href)
const { createUserMessage } = await import(pathToFileURL(require.resolve('@tianwen/dsh-compat')).href)

// Explicit engineering controls: never natural sources, user feedback or learning effects.
export function developmentStudyResultFixture(cwd = 'D:/DevData/tianwen-dev-study-result-host-20261003/saved-only') {
  const qualityContract = conversationQualityContract()
  const requiredCondition = 'Both declared modules and the unchanged original entry return precisely the original JSON, exit 0 and empty stderr.'
  const graph = n => ({ entries: [
    { path: `task${n}.mjs`, content: null }, { path: `extra${n}.mjs`, content: null },
    { path: 'entry.mjs', content: `import {left} from './task${n}.mjs';import {right} from './extra${n}.mjs';console.log(JSON.stringify({value:left+right}));\n` },
  ], outputPaths: [`task${n}.mjs`, `extra${n}.mjs`] })
  const original = n => ({ requestText: `Implement task${n}.mjs and extra${n}.mjs: export left=${n} and right=${10*n}, respectively. Read entry.mjs and both absent outputs first. ${requiredCondition}`,
    ...graph(n), entryPath: 'entry.mjs', requiredCondition,
    cases: [{ id: `original-${n}`, input: '{}', expectedJson: JSON.stringify({value:11*n}), exitCode: 0 }] })
  const independent = n => { const {requestText,...rest}=original(n);return {...rest,prompt:requestText,criteria:[requiredCondition]} }
  const config = {cwd,qualityContract,originals:[original(1),original(2),original(3)],adjacent:independent(4),holdout:independent(5)}
  const source = n => ({request:[createUserMessage({source:{kind:'user'},content:[{type:'text',text:original(n).requestText}]})],context:[],objective:`Implement original modules ${n}.`,criteria:[requiredCondition],qualityContract,
    files:{schemaVersion:'tianwen.conversation-file-material.v1',outputKind:'files',cwd,...graph(n)}})
  const controller = new AbortController()
  const material = {cwd,qualityContract,sources:[source(2),source(1)],counterexample:source(3),modelConfigDigest:sha256('dev-result-host-controlled-model-A'),signal:controller.signal}
  const ordinary = n => { const {entries,...rest}=original(n);return {cwd,...rest,referencePaths:entries.filter(entry=>!rest.outputPaths.includes(entry.path)).map(entry=>entry.path)} }
  return {config,material,controller,original,independent,ordinary,source,requiredCondition,
    program:n=>({left:`export const left=${n};`,right:`export const right=${10*n};`})}
}
export { sha256 }
