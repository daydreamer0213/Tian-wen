import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packagesRoot = resolve(root, 'packages')

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

let entries
try {
  entries = readdirSync(packagesRoot, { withFileTypes: true })
} catch (error) {
  if (error.code === 'ENOENT') {
    process.exit(0)
  }
  throw error
}

const projects = entries
  .filter(entry => entry.isDirectory())
  .map(entry => `packages/${entry.name}/tsconfig.json`)
  .filter(path => existsSync(resolve(root, path)))
  .sort()

if (projects.length > 0) {
  const command = pnpmCommand(['exec', 'tsc', '-b', ...projects, '--pretty', 'false'])
  execFileSync(
    command.executable,
    command.args,
    { cwd: root, shell: false, stdio: 'inherit' },
  )
}
