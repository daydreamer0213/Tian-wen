import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const EXPECTED_DSH_VERSION = '0.1.1-rc.2'
const DSH_CLI_PACKAGE = '@deepseek-ai/dsh'
const DSH_LIBRARY_PACKAGES = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-loop',
  '@deepseek-ai/dsh-agent-loop-testkit',
  '@deepseek-ai/dsh-cordis-host-runner',
  '@deepseek-ai/dsh-goal',
  '@deepseek-ai/dsh-goal-round-driver',
  '@deepseek-ai/dsh-jobs-local',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-message-feedback',
  '@deepseek-ai/dsh-sandbox',
  '@deepseek-ai/dsh-sandbox-local',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-persistence-jsonl',
  '@deepseek-ai/dsh-session-query',
  '@deepseek-ai/dsh-session-query-sqlite',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-tool-goal',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-workflow-worker-thread',
]
const EXPECTED_DIRECT_DSH_PACKAGES = [
  DSH_CLI_PACKAGE,
  ...DSH_LIBRARY_PACKAGES,
]
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

export function targetExistsInsidePackage(packageRoot, target) {
  if (typeof target !== 'string' || target.length === 0) {
    return false
  }
  const targetPath = resolve(packageRoot, target)
  const relativeTarget = relative(packageRoot, targetPath)
  if (
    relativeTarget === ''
    || relativeTarget.startsWith('..')
    || isAbsolute(relativeTarget)
  ) {
    return false
  }
  try {
    const realPackageRoot = realpathSync(packageRoot)
    const realTarget = realpathSync(targetPath)
    const realRelativeTarget = relative(realPackageRoot, realTarget)
    return realRelativeTarget !== ''
      && !realRelativeTarget.startsWith('..')
      && !isAbsolute(realRelativeTarget)
      && statSync(realTarget).isFile()
  } catch {
    return false
  }
}

function inspectPublishedPackageSurfaces(failures) {
  const rootManifest = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8'),
  )
  const actualNames = Object.keys(rootManifest.devDependencies)
    .filter(isDshPackage)
    .sort()
  if (JSON.stringify(actualNames) !== JSON.stringify(EXPECTED_DIRECT_DSH_PACKAGES)) {
    failures.push(
      `direct DSH dependencies differ from the probe contract: ${JSON.stringify(actualNames)}`,
    )
  }
  const packageSurfaces = []

  for (const name of EXPECTED_DIRECT_DSH_PACKAGES) {
    try {
      const manifestPath = requireFromRoot.resolve(`${name}/package.json`)
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const packageRoot = dirname(manifestPath)

      if (name === DSH_CLI_PACKAGE) {
        const cliTarget = targetExistsInsidePackage(packageRoot, manifest.bin?.dsh)
        packageSurfaces.push({
          name,
          kind: 'cli',
          rootExport: false,
          typesTarget: false,
          defaultTarget: false,
          cliTarget,
        })
        if (!cliTarget) {
          failures.push(`${name}: published CLI target bin.dsh is unavailable`)
        }
        continue
      }

      const rootEntry = manifest.exports?.['.']
      const rootExport = rootEntry !== undefined
      const typesTarget = targetExistsInsidePackage(packageRoot, rootEntry?.types)
      const defaultTarget = targetExistsInsidePackage(packageRoot, rootEntry?.default)
      packageSurfaces.push({
        name,
        kind: 'library',
        rootExport,
        typesTarget,
        defaultTarget,
        cliTarget: false,
      })
      if (!rootExport) {
        failures.push(`${name}: published library has no root "." export`)
      }
      if (!typesTarget) {
        failures.push(`${name}: published library root types target is unavailable`)
      }
      if (!defaultTarget) {
        failures.push(`${name}: published library root default target is unavailable`)
      }
    } catch (error) {
      failures.push(`${name}: public package.json export unavailable (${error.message})`)
    }
  }

  return packageSurfaces
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

function modulePattern(node) {
  if (node === undefined) {
    return undefined
  }
  if (ts.isStringLiteralLike(node)) {
    return node.text
  }
  if (ts.isParenthesizedExpression(node)) {
    return modulePattern(node.expression)
  }
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans
      .map(span => `${
        modulePattern(span.expression) ?? '<dynamic>'
      }${span.literal.text}`)
      .join('')
  }
  if (
    ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return `${modulePattern(node.left) ?? '<dynamic>'}${
      modulePattern(node.right) ?? '<dynamic>'
    }`
  }
  return undefined
}

function scanPrivateImports() {
  const violations = new Map()
  for (const file of scanRoots.flatMap(sourceFiles).sort()) {
    const source = readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.getScriptKindFromFileName(file),
    )
    const addViolation = specifier => {
      const normalized = specifier?.replaceAll('\\', '/')
      const scopeIndex = normalized?.indexOf('@deepseek-ai/') ?? -1
      const constructedDeepSeekPath = normalized?.includes('<dynamic>')
        && normalized.includes('@deepseek')
      if (
        normalized !== undefined
        && (
          (
            scopeIndex >= 0
            && normalized.indexOf('/src/', scopeIndex) >= 0
          )
          || constructedDeepSeekPath
        )
      ) {
        const fileName = relative(root, file).replaceAll('\\', '/')
        violations.set(
          `${fileName}\0${normalized}`,
          { file: fileName, specifier: normalized },
        )
      }
    }
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        addViolation(modulePattern(node.moduleSpecifier))
      } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        addViolation(modulePattern(node.arguments?.[0]))
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        addViolation(modulePattern(node.argument.literal))
      } else if (
        ts.isImportEqualsDeclaration(node)
        && ts.isExternalModuleReference(node.moduleReference)
      ) {
        addViolation(modulePattern(node.moduleReference.expression))
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  return [...violations.values()].sort((left, right) =>
    left.file.localeCompare(right.file) || left.specifier.localeCompare(right.specifier),
  )
}

function main(args) {
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
  const packageSurfaces = inspectPublishedPackageSurfaces(failures)

  const privateImportViolations = args.includes('--imports')
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
    packageSurfaces,
    privateImportViolations,
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (failures.length > 0) {
    process.stderr.write(`${failures.sort().join('\n')}\n`)
    process.exitCode = 1
  }
}

if (
  process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2))
}
