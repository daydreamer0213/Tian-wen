import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const B1_APPLICATION_FILES = new Set([
  'dist/bootstrap.js',
  'dist/host.js',
  'dist/main.js',
  'package.json',
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
  const applicationFiles = collectFiles(join(resources, 'app'))
  const unexpectedApplicationFiles = applicationFiles.filter(path => !B1_APPLICATION_FILES.has(path))
  const missingApplicationFiles = [...B1_APPLICATION_FILES].filter(path => !applicationFiles.includes(path))
  if (unexpectedApplicationFiles.length > 0 || missingApplicationFiles.length > 0) {
    throw new Error(
      `application allowlist mismatch; forbidden: ${unexpectedApplicationFiles.join(', ') || 'none'}; missing: ${missingApplicationFiles.join(', ') || 'none'}`,
    )
  }

  for (const legalResource of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.md']) {
    const path = join(resources, legalResource)
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`missing required resource: ${legalResource}`)
  }

  const runtime = join(resources, 'runtime')
  if (expectedRuntimeTarball === undefined && existsSync(runtime)) {
    throw new Error('forbidden Runtime resource in B1 artifact')
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const unpackedRoot = process.argv[2]
    if (unpackedRoot === undefined) throw new Error('usage: node scripts/audit-desktop-artifact.mjs <win-unpacked>')
    auditDesktopArtifact(unpackedRoot)
    process.stdout.write(`Desktop artifact audit passed: ${resolve(unpackedRoot)}\n`)
  } catch (error) {
    process.stderr.write(`Desktop artifact audit failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
