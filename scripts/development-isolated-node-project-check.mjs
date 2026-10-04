import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import host from './development-isolated-node-project-host.json' with { type: 'json' }
import { buildDevelopmentFunctionalStudyCases } from './development-functional-study-cases.mjs'
import { createDevelopmentOrdinaryTaskCheck } from './development-ordinary-task-check.mjs'
import { createDevelopmentGoalTaskCheck } from './development-goal-task-check.mjs'
const packageUrl = new URL('../packages/tianwen-runtime-bundle/package.json', import.meta.url)
const manifest = JSON.parse(readFileSync(packageUrl, 'utf8'))
const require = createRequire(packageUrl)
const { parseConversationFileMaterial, parseConversationQualityContract } = await import(pathToFileURL(require.resolve('@tianwen/evolution')).href)
const { createConversationIsolatedNodeProjectCheck, createConversationStudyIsolatedNodeProjectCheck,
  createConversationStudyIsolatedNodeProjectCohortCheck, createGoalTaskIsolatedNodeProjectCheck } = await import(new URL(manifest.exports['.'].default, packageUrl).href)

function withFixedHost(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  return { ...config, isolated: structuredClone(host) }
}
export function createDevelopmentIsolatedNodeProjectCheck(config) {
  return createConversationIsolatedNodeProjectCheck(withFixedHost(config))
}
export function createDevelopmentGoalTaskIsolatedNodeProjectCheck(config) {
  return createGoalTaskIsolatedNodeProjectCheck(withFixedHost(config))
}
export function createDevelopmentStudyIsolatedNodeProjectCheck(config) {
  return createConversationStudyIsolatedNodeProjectCheck(withFixedHost(config))
}
/** Caller-owned frozen roles and explicit entries; the SDK validates their complete original material. */
export function createDevelopmentStudyIsolatedNodeProjectCohortCheck(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  assert(config.cases !== null && typeof config.cases === 'object' && !Array.isArray(config.cases))
  const cases = Object.fromEntries(Object.entries(config.cases).map(([role, entry]) => [role, withFixedHost(entry)]))
  return createConversationStudyIsolatedNodeProjectCohortCheck({ ...config, cases })
}

/** Match frozen originals once; retain the SDK's closed cohort and fixed DEV host. */
export function createDevelopmentFunctionalStudyCohortCheck(config, material) {
  const cases = buildDevelopmentFunctionalStudyCases(config, material)
  return cases === undefined ? undefined : createDevelopmentStudyIsolatedNodeProjectCohortCheck({
    modelConfigDigest: material.modelConfigDigest, cases,
  })
}

/** Fail on broken frozen contracts before the Runtime can consume a study attempt. */
function freezeStudyContracts(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  const frozen = structuredClone(config)
  buildDevelopmentFunctionalStudyCases(frozen, undefined)
  parseConversationQualityContract(frozen.qualityContract)
  for (const contract of [...frozen.originals, frozen.adjacent, frozen.holdout]) {
    const files = parseConversationFileMaterial({ schemaVersion: 'tianwen.conversation-file-material.v1',
      outputKind: 'files', cwd: frozen.cwd, entries: contract.entries, outputPaths: contract.outputPaths })
    const references = files.entries.filter(entry => !files.outputPaths.includes(entry.path))
    assert(references.every(entry => entry.content !== null), 'Frozen readonly input must have original content')
    // The executor's original static path rules also apply to absent future outputs.
    const names = new Set(files.entries.map(entry => entry.path.toLowerCase()))
    assert([...names].every(path => !path.split('/').includes('package.json')
      && path !== '.tianwen-loader.mjs' && !path.startsWith('.tianwen-loader.mjs/')), 'Frozen graph uses an executor-reserved path')
    for (const entry of files.entries) if (/\.(?:m?ts)$/u.test(entry.path)) {
      const alias = entry.path.replace(/\.mts$/u, '.mjs').replace(/\.ts$/u, '.js').toLowerCase()
      assert(!names.has(alias) && ![...names].some(name => name.startsWith(alias + '/') || alias.startsWith(name + '/')), 'Frozen graph conflicts with an original TypeScript module alias')
      names.add(alias)
    }
    assert(!Object.hasOwn(contract, 'isolated'), 'DEV isolated override is not permitted')
    // Constructor validation only: no environment preparation or invented task material.
    createDevelopmentStudyIsolatedNodeProjectCheck({ cwd: frozen.cwd,
      requestText: contract.requestText ?? contract.prompt, entryPath: contract.entryPath,
      outputPaths: files.outputPaths, referencePaths: references.map(entry => entry.path),
      criteria: contract.criteria ?? [contract.requiredCondition], cases: contract.cases,
      requiredCondition: contract.requiredCondition })
  }
  return frozen
}

/** One frozen project scope; actual selected originals determine every closed cohort. */
export function createDevelopmentFunctionalStudyResultCheck(config) {
  const frozen = freezeStudyContracts(config)
  let cohort, generation = 0
  return {
    async prepareIndependentCases(material) {
      const currentGeneration = ++generation
      cohort = undefined
      material.signal.throwIfAborted()
      try {
        const next = createDevelopmentFunctionalStudyCohortCheck(frozen, material)
        if (next === undefined) return undefined
        const independent = await next.prepareIndependentCases(material)
        material.signal.throwIfAborted()
        if (currentGeneration !== generation || independent === undefined) return undefined
        cohort = next
        return independent
      } catch {
        material.signal.throwIfAborted()
        return undefined
      }
    },
    async prepare(material) {
      material.signal.throwIfAborted()
      const current = cohort
      return current === undefined ? undefined : current.prepare(material)
    },
  }
}

/** Spread these host-owned options into the actual DEV Runtime before tasks arrive. */
export function createDevelopmentNativeCheckOptions(ordinaryContract, studyContracts, goalContract) {
  const ordinaryContracts = Array.isArray(ordinaryContract) ? ordinaryContract : [ordinaryContract]
  for (const contract of ordinaryContracts)
    assert.equal(contract?.cwd, studyContracts.cwd, 'DEV ordinary and study contracts must share the frozen cwd')
  const studyResultCheck = createDevelopmentFunctionalStudyResultCheck(studyContracts)
  if (goalContract !== undefined) for (const contract of Array.isArray(goalContract) ? goalContract : [goalContract])
    assert.equal(contract?.cwd, studyContracts.cwd, 'DEV Goal contract must share the frozen cwd')
  return { externalCodeCheck: createDevelopmentOrdinaryTaskCheck(ordinaryContract, createDevelopmentIsolatedNodeProjectCheck), studyResultCheck,
    ...(goalContract === undefined ? {} : { goalTaskAcceptance: createDevelopmentGoalTaskCheck(goalContract, createDevelopmentGoalTaskIsolatedNodeProjectCheck) }) }
}
