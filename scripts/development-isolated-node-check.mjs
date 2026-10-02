import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import host from './development-isolated-node-host.json' with { type: 'json' }

// The repository root is not a consumer of this workspace package; load its published root export.
const packageUrl = new URL('../packages/tianwen-runtime-bundle/package.json', import.meta.url)
const manifest = JSON.parse(readFileSync(packageUrl, 'utf8'))
const { createConversationIsolatedNodeCheck } = await import(new URL(manifest.exports['.'].default, packageUrl).href)

/** DEV host configuration only; original task/cases/condition stay owned by the caller. */
export function createDevelopmentIsolatedNodeCheck(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  assert(typeof config.targetPath === 'string')
  const language = /\.(?:m?ts)$/u.test(config.targetPath) ? 'typescript' : 'javascript'
  return createConversationIsolatedNodeCheck({ ...config, isolated: structuredClone(host[language]) })
}
