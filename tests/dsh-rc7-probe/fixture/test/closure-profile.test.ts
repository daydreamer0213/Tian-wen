import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const expectedVersion = '0.1.0-rc.7'
const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromFixture = createRequire(resolve(fixtureRoot, 'package.json'))
const manifest = JSON.parse(
  readFileSync(resolve(fixtureRoot, 'package.json'), 'utf8'),
) as { packageManager: string; dependencies: Record<string, string> }
const directDshPackages = Object.keys(manifest.dependencies)
  .filter(name => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
  .sort()

type DependencyNode = {
  version?: string
  dependencies?: Record<string, DependencyNode>
  devDependencies?: Record<string, DependencyNode>
  optionalDependencies?: Record<string, DependencyNode>
}

type PackageManifest = {
  bin?: { dsh?: string }
  exports?: { '.'?: string | { types?: string; default?: string } }
}

function collectDshVersions(node: DependencyNode, versions: Set<string>): void {
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
    for (const [name, dependency] of Object.entries(node[group] ?? {})) {
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
        versions.add(String(dependency.version))
      }
      collectDshVersions(dependency, versions)
    }
  }
}

function listDependencyTree(): DependencyNode[] {
  const corepackHome = process.env.COREPACK_HOME
  assert.ok(corepackHome, 'COREPACK_HOME is required for the exact pnpm executable')
  const pnpmVersion = manifest.packageManager.split('@').at(-1)
  assert.ok(pnpmVersion)
  const executable = resolve(corepackHome, 'v1', 'pnpm', pnpmVersion, 'bin', 'pnpm.mjs')
  assert.equal(existsSync(executable), true, `missing exact pnpm executable: ${executable}`)
  return JSON.parse(execFileSync(process.execPath, [
    executable,
    'list',
    '--json',
    '--depth',
    'Infinity',
  ], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  })) as DependencyNode[]
}

function targetExistsInsidePackage(packageRoot: string, target: unknown): boolean {
  if (typeof target !== 'string' || target.length === 0) return false
  const targetPath = resolve(packageRoot, target)
  const relativeTarget = relative(packageRoot, targetPath)
  if (relativeTarget === '' || relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) {
    return false
  }
  try {
    const realRelative = relative(realpathSync(packageRoot), realpathSync(targetPath))
    return realRelative !== ''
      && !realRelative.startsWith('..')
      && !isAbsolute(realRelative)
      && statSync(targetPath).isFile()
  } catch {
    return false
  }
}

test('published dependency closure contains only exact rc.7 DSH packages', () => {
  const versions = new Set<string>()
  for (const tree of listDependencyTree()) collectDshVersions(tree, versions)
  assert.deepEqual(versions, new Set([expectedVersion]))
})

test('direct rc.7 package root exports and CLI targets are published', async () => {
  for (const name of directDshPackages) {
    const manifestPath = requireFromFixture.resolve(`${name}/package.json`)
    const packageRoot = dirname(manifestPath)
    const packageManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest

    if (name === '@deepseek-ai/dsh') {
      assert.equal(targetExistsInsidePackage(packageRoot, packageManifest.bin?.dsh), true)
      continue
    }

    const rootEntry = packageManifest.exports?.['.']
    assert.notEqual(rootEntry, undefined, `${name} must publish a root export`)
    const typesTarget = typeof rootEntry === 'object' ? rootEntry.types : undefined
    const defaultTarget = typeof rootEntry === 'object' ? rootEntry.default : rootEntry
    assert.equal(targetExistsInsidePackage(packageRoot, typesTarget), true, `${name} types`)
    assert.equal(targetExistsInsidePackage(packageRoot, defaultTarget), true, `${name} default`)
    assert.notEqual(await import(name), undefined, `${name} must load from its public root`)
  }
})
