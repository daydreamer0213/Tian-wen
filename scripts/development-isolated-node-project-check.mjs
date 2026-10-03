import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import host from './development-isolated-node-project-host.json' with { type: 'json' }
import { buildDevelopmentFunctionalStudyCases } from './development-functional-study-cases.mjs'
const packageUrl = new URL('../packages/tianwen-runtime-bundle/package.json', import.meta.url)
const manifest = JSON.parse(readFileSync(packageUrl, 'utf8'))
const { createConversationIsolatedNodeProjectCheck, createConversationStudyIsolatedNodeProjectCheck,
  createConversationStudyIsolatedNodeProjectCohortCheck } = await import(new URL(manifest.exports['.'].default, packageUrl).href)

function withFixedHost(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  return { ...config, isolated: structuredClone(host) }
}
export function createDevelopmentIsolatedNodeProjectCheck(config) {
  return createConversationIsolatedNodeProjectCheck(withFixedHost(config))
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
