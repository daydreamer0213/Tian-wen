import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RUNTIME_ARCHIVE_NAME = 'tianwen-runtime-bundle-0.1.4.tgz'

export function stageDesktopRuntime(sourceTarball, packageRoot) {
  if (!isAbsolute(sourceTarball)) throw new Error('Runtime source path must be absolute')
  if (basename(sourceTarball) !== RUNTIME_ARCHIVE_NAME) {
    throw new Error(`Runtime source basename must be ${RUNTIME_ARCHIVE_NAME}`)
  }

  let sourceStats
  try {
    sourceStats = statSync(sourceTarball)
  } catch {
    throw new Error(`Runtime source file is missing: ${sourceTarball}`)
  }
  if (!sourceStats.isFile()) throw new Error(`Runtime source must be a file: ${sourceTarball}`)

  const staged = join(resolve(packageRoot), 'dist', 'runtime', RUNTIME_ARCHIVE_NAME)
  const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex')
  const sourceDigest = digest(sourceTarball)
  mkdirSync(dirname(staged), { recursive: true })
  copyFileSync(sourceTarball, staged)
  if (digest(staged) !== sourceDigest || digest(sourceTarball) !== sourceDigest) {
    throw new Error('Staged Runtime SHA-256 digest does not match the source archive')
  }
  return staged
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 1) {
      throw new Error('usage: node scripts/stage-desktop-runtime.mjs <absolute-runtime-tarball>')
    }
    const scriptRoot = dirname(fileURLToPath(import.meta.url))
    const staged = stageDesktopRuntime(
      args[0],
      join(scriptRoot, '..', 'packages', 'tianwen-desktop-host'),
    )
    process.stdout.write(`Desktop Runtime staged: ${staged}\n`)
  } catch (error) {
    process.stderr.write(`Desktop Runtime staging failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
