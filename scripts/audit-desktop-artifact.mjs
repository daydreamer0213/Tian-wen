import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const B1_APPLICATION_FILES = new Set([
  'dist/bootstrap.js',
  'dist/host.js',
  'dist/main.js',
  'package.json',
])

const B1_RESOURCE_FILES = new Set([
  'app/dist/bootstrap.js',
  'app/dist/host.js',
  'app/dist/main.js',
  'app/package.json',
  'LICENSE.txt',
  'THIRD_PARTY_NOTICES.md',
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
  if (expectedRuntimeTarball === undefined) {
    const unexpectedResourceFiles = resourceFiles.filter(path => !B1_RESOURCE_FILES.has(path))
    const missingResourceFiles = [...B1_RESOURCE_FILES].filter(path => !resourceFiles.includes(path))
    if (unexpectedResourceFiles.length > 0 || missingResourceFiles.length > 0) {
      throw new Error(
        `resource allowlist mismatch; forbidden: ${unexpectedResourceFiles.join(', ') || 'none'}; missing: ${missingResourceFiles.join(', ') || 'none'}`,
      )
    }

    if (existsSync(join(resources, 'runtime'))) {
      throw new Error('forbidden Runtime resource in B1 artifact')
    }
    return
  }

  const applicationFiles = resourceFiles
    .filter(path => path.startsWith('app/'))
    .map(path => path.slice('app/'.length))
  const unexpectedApplicationFiles = applicationFiles.filter(path => !B1_APPLICATION_FILES.has(path))
  const missingApplicationFiles = [...B1_APPLICATION_FILES].filter(path => !applicationFiles.includes(path))
  if (unexpectedApplicationFiles.length > 0 || missingApplicationFiles.length > 0) {
    throw new Error(
      `application allowlist mismatch; forbidden: ${unexpectedApplicationFiles.join(', ') || 'none'}; missing: ${missingApplicationFiles.join(', ') || 'none'}`,
    )
  }

  for (const legalResource of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.md']) {
    if (!resourceFiles.includes(legalResource)) throw new Error(`missing required resource: ${legalResource}`)
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
