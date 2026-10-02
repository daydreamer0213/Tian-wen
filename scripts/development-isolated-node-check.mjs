import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import host from './development-isolated-node-host.json' with { type: 'json' }

// The repository root is not a consumer of this workspace package; load its published root export.
const packageUrl = new URL('../packages/tianwen-runtime-bundle/package.json', import.meta.url)
const manifest = JSON.parse(readFileSync(packageUrl, 'utf8'))
const { createConversationIsolatedNodeCheck, createConversationStudyIsolatedNodeCheck,
  createConversationStudyIsolatedNodeCohortCheck } = await import(new URL(manifest.exports['.'].default, packageUrl).href)

/** DEV host configuration only; original task/cases/condition stay owned by the caller. */
function withFixedHost(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  assert(typeof config.targetPath === 'string')
  const language = /\.(?:m?ts)$/u.test(config.targetPath) ? 'typescript' : 'javascript'
  return { ...config, isolated: structuredClone(host[language]) }
}

export function createDevelopmentIsolatedNodeCheck(config) {
  return createConversationIsolatedNodeCheck(withFixedHost(config))
}

export function createDevelopmentStudyIsolatedNodeCheck(config) {
  return createConversationStudyIsolatedNodeCheck(withFixedHost(config))
}

/** Five caller-frozen roles; choose each executor from its saved single output path. */
export function createDevelopmentStudyIsolatedNodeCohortCheck(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  assert(config.cases !== null && typeof config.cases === 'object' && !Array.isArray(config.cases))
  const cases = Object.fromEntries(Object.entries(config.cases).map(([role, entry]) => {
    assert(entry !== null && typeof entry === 'object' && !Array.isArray(entry))
    assert(!Object.hasOwn(entry, 'isolated'), 'DEV isolated override is not permitted')
    const paths = entry.material?.files?.outputPaths
    assert(Array.isArray(paths) && paths.length === 1 && typeof paths[0] === 'string')
    const { isolated } = withFixedHost({ targetPath: paths[0] })
    return [role, { ...entry, isolated }]
  }))
  return createConversationStudyIsolatedNodeCohortCheck({ ...config, cases })
}
