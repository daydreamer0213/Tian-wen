import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'

const EXPECTED_DSH_VERSION = '0.1.0-rc.6'
const root = resolve(import.meta.dirname, '..')
const requireFromRoot = createRequire(resolve(root, 'package.json'))
const scanExtensions = new Set(['.ts', '.mts', '.cts', '.js', '.mjs'])
const scanRoots = ['packages', 'tests/dsh-probe', 'scripts']

const isDshPackage = name =>
  name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')

function pnpmCommand(args) {
  if (process.platform !== 'win32') {
    return { executable: 'pnpm', args }
  }
  const version = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8'),
  ).packageManager.split('@').at(-1)
  const corepackHome = process.env.COREPACK_HOME
  if (corepackHome === undefined) {
    throw new Error('COREPACK_HOME is required to invoke pnpm without a Windows shell')
  }
  const executable = resolve(corepackHome, 'v1', 'pnpm', version, 'bin', 'pnpm.mjs')
  if (!existsSync(executable)) {
    throw new Error(`exact pnpm executable is unavailable: ${executable}`)
  }
  return { executable: process.execPath, args: [executable, ...args] }
}

function visitDependencyTree(node, installedPackages, failures) {
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, dependency] of Object.entries(node[group] ?? {})) {
      const version = dependency?.version
      if (isDshPackage(name)) {
        installedPackages.set(`${name}@${String(version)}`, {
          name,
          version: String(version),
        })
        if (version !== EXPECTED_DSH_VERSION) {
          failures.push(`${name}: expected ${EXPECTED_DSH_VERSION}, got ${String(version)}`)
        }
      }
      if (dependency !== null && typeof dependency === 'object') {
        visitDependencyTree(dependency, installedPackages, failures)
      }
    }
  }
}

function requirePublishedPackageSurfaces(failures) {
  const rootManifest = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8'),
  )
  const requiredNames = Object.keys(rootManifest.devDependencies)
    .filter(isDshPackage)
    .sort()

  for (const name of requiredNames) {
    try {
      const manifestPath = requireFromRoot.resolve(`${name}/package.json`)
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const exportsField = manifest.exports
      const hasRootExport = typeof exportsField === 'string'
        || (
          exportsField !== null
          && typeof exportsField === 'object'
          && Object.hasOwn(exportsField, '.')
        )
      if (!hasRootExport) {
        failures.push(`${name}: published package has no root "." export`)
      }
    } catch (error) {
      failures.push(`${name}: public package.json export unavailable (${error.message})`)
    }
  }
}

function sourceFiles(directory) {
  const absolute = resolve(root, directory)
  let entries
  try {
    entries = readdirSync(absolute, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  return entries.flatMap(entry => {
    const child = resolve(absolute, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(relative(root, child))
    }
    return entry.isFile() && scanExtensions.has(extname(entry.name))
      ? [child]
      : []
  })
}

function scanPrivateImports() {
  const violations = []
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const file of scanRoots.flatMap(sourceFiles).sort()) {
    const source = readFileSync(file, 'utf8')
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]
        if (specifier?.startsWith('@deepseek-ai/') && specifier.includes('/src/')) {
          violations.push({
            file: relative(root, file).replaceAll('\\', '/'),
            specifier,
          })
        }
      }
    }
  }

  return violations.sort((left, right) =>
    left.file.localeCompare(right.file) || left.specifier.localeCompare(right.specifier),
  )
}

const failures = []
const listCommand = pnpmCommand(['list', '--json', '--depth', 'Infinity'])
const listOutput = execFileSync(
  listCommand.executable,
  listCommand.args,
  {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  },
)
const dependencyTrees = JSON.parse(listOutput)
const installedPackages = new Map()

for (const tree of dependencyTrees) {
  visitDependencyTree(tree, installedPackages, failures)
}
requirePublishedPackageSurfaces(failures)

const privateImportViolations = process.argv.includes('--imports')
  ? scanPrivateImports()
  : []
for (const violation of privateImportViolations) {
  failures.push(`${violation.file}: private DSH import ${violation.specifier}`)
}

const report = {
  expectedDshVersion: EXPECTED_DSH_VERSION,
  installedPackages: [...installedPackages.values()].sort((left, right) =>
    left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  ),
  privateImportViolations,
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (failures.length > 0) {
  process.stderr.write(`${failures.sort().join('\n')}\n`)
  process.exitCode = 1
}
