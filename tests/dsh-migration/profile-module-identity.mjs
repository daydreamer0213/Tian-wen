import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const packages = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-cordis-host-runner',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-session',
]

const profileRoot = process.env.TIANWEN_DSH_PROFILE_ROOT
if (!profileRoot) throw new Error('TIANWEN_DSH_PROFILE_ROOT is required')

const profileManifest = realpathSync(resolve(profileRoot, 'package.json'))
const requireFromProfile = createRequire(profileManifest)

function identity(requireFromAnchor, packageName) {
  let entry
  try {
    entry = requireFromAnchor.resolve(packageName)
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') return null
    throw error
  }

  let packageRoot = dirname(realpathSync(entry))
  while (true) {
    const manifestPath = resolve(packageRoot, 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (manifest.name === packageName) {
        return { version: manifest.version, root: realpathSync(packageRoot) }
      }
    }
    const parent = dirname(packageRoot)
    if (parent === packageRoot) throw new Error(`package manifest not found for ${packageName}`)
    packageRoot = parent
  }
}

const runtimeIdentity = identity(requireFromProfile, '@tianwen/runtime-bundle')
const runtimeManifest = runtimeIdentity === null
  ? null
  : realpathSync(resolve(runtimeIdentity.root, 'package.json'))
const requireFromRuntime = runtimeManifest === null ? null : createRequire(runtimeManifest)

const rows = packages.map((packageName) => {
  const profile = identity(requireFromProfile, packageName)
  const runtime = requireFromRuntime === null ? null : identity(requireFromRuntime, packageName)
  return {
    package: packageName,
    profile,
    runtime,
    sameIdentity: profile === null || runtime === null
      ? null
      : profile.version === runtime.version && profile.root === runtime.root,
  }
})

console.log(JSON.stringify({
  profileRoot: realpathSync(profileRoot),
  anchors: { profile: profileManifest, runtime: runtimeManifest },
  rows,
}, null, 2))
