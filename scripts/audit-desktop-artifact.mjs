import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const RUNTIME_ARCHIVE_NAME = 'tianwen-runtime-bundle-0.1.9.tgz'

function runtimeArchiveFiles(path) {
  const candidate = process.platform === 'win32'
    ? resolve(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows', 'System32', 'tar.exe')
    : (existsSync('/usr/bin/tar') ? '/usr/bin/tar' : '/bin/tar')
  const executable = realpathSync(candidate)
  if (!statSync(executable).isFile()) throw new Error('fixed tar executable is not a file')
  const result = spawnSync(executable, ['-tzf', path], { encoding: 'utf8', shell: false })
  if (result.status !== 0) throw new Error('packaged Runtime archive cannot be listed')
  return result.stdout.replaceAll('\r\n', '\n').split('\n').filter(Boolean)
    .map(name => name.replace(/^package\//u, ''))
}

const B1_RESOURCE_FILES = new Set([
  'app/dist/bootstrap.js',
  'app/dist/host.js',
  'app/dist/locale.js',
  'app/dist/main.js',
  'app/package.json',
  'LICENSE.txt',
  'THIRD_PARTY_NOTICES.md',
])

const B2_RESOURCE_FILES = new Set([
  ...B1_RESOURCE_FILES,
  'app/dist/profile-prepare.js',
  `runtime/${RUNTIME_ARCHIVE_NAME}`,
])

function collectFiles(root) {
  if (!existsSync(root)) throw new Error(`missing required directory: ${root}`)
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`forbidden symbolic link: ${path}`)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(relative(root, path).replaceAll('\\', '/'))
      else throw new Error(`forbidden non-file artifact entry: ${path}`)
    }
  }
  visit(root)
  return files
}

export function auditDesktopArtifact(unpackedRoot, expectedRuntimeTarball) {
  const root = resolve(unpackedRoot)
  const resources = join(root, 'resources')
  const resourceFiles = collectFiles(resources)
  if (expectedRuntimeTarball === undefined && existsSync(join(resources, 'runtime'))) {
    throw new Error('forbidden Runtime resource in B1 artifact')
  }
  const allowlist = expectedRuntimeTarball === undefined
    ? B1_RESOURCE_FILES
    : B2_RESOURCE_FILES
  const unexpectedResourceFiles = resourceFiles.filter(path => !allowlist.has(path))
  const missingResourceFiles = [...allowlist].filter(path => !resourceFiles.includes(path))
  if (unexpectedResourceFiles.length > 0 || missingResourceFiles.length > 0) {
    throw new Error(
      `resource allowlist mismatch; forbidden: ${unexpectedResourceFiles.join(', ') || 'none'}; missing: ${missingResourceFiles.join(', ') || 'none'}`,
    )
  }

  if (expectedRuntimeTarball === undefined) return
  if (!isAbsolute(expectedRuntimeTarball)) {
    throw new Error('expected Runtime source path must be absolute')
  }
  if (basename(expectedRuntimeTarball) !== RUNTIME_ARCHIVE_NAME) {
    throw new Error(`expected Runtime source basename must be ${RUNTIME_ARCHIVE_NAME}`)
  }

  let sourceStats
  try {
    sourceStats = statSync(expectedRuntimeTarball)
  } catch {
    throw new Error(`expected Runtime source file is missing: ${expectedRuntimeTarball}`)
  }
  if (!sourceStats.isFile()) {
    throw new Error(`expected Runtime source must be a file: ${expectedRuntimeTarball}`)
  }

  const packagedRuntime = join(resources, 'runtime', RUNTIME_ARCHIVE_NAME)
  const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex')
  if (digest(expectedRuntimeTarball) !== digest(packagedRuntime)) {
    throw new Error('Runtime SHA-256 digest does not match the source archive')
  }
  if (!runtimeArchiveFiles(packagedRuntime).includes('dist/client.js')) {
    throw new Error('packaged Runtime archive is missing dist/client.js')
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length < 1 || args.length > 2) {
      throw new Error('usage: node scripts/audit-desktop-artifact.mjs <win-unpacked> [absolute-runtime-tarball]')
    }
    auditDesktopArtifact(args[0], args[1])
    process.stdout.write(`Desktop artifact audit passed: ${resolve(args[0])}\n`)
  } catch (error) {
    process.stderr.write(`Desktop artifact audit failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
