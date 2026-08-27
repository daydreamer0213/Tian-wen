import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const requireFromDsh = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))
const requireFromAppBoot = createRequire(requireFromDsh.resolve('@deepseek-ai/dsh-app-boot/package.json'))
const yaml = requireFromAppBoot('js-yaml')
const dshBin = process.env.TIANWEN_DSH_BIN
  ?? join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib', 'bin.js')
const concurrency = 8
const timeoutMs = 120_000
const fixtureParent = process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-v0.1-eval-fixtures'

function runDsh(home) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dshBin, 'web', '--help'], {
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    if (child.stdout === null || child.stderr === null) {
      reject(new Error('DSH child pipes are required'))
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timeout)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

function fail(message) {
  throw new Error(message)
}

if (process.platform !== 'win32') {
  fail('the Profile concurrent cold-boot check is Windows-only')
}

mkdirSync(fixtureParent, { recursive: true })
const home = mkdtempSync(join(fixtureParent, 'tianwen-dsh-concurrent-'))
const startedAt = performance.now()

try {
  const results = await Promise.all(Array.from({ length: concurrency }, () => runDsh(home)))
  for (const [index, result] of results.entries()) {
    if (result.timedOut) fail(`DSH child ${index + 1} exceeded ${timeoutMs}ms`)
    if (result.code !== 0) fail(`DSH child ${index + 1} exited ${result.code}: ${result.stderr}`)
    if (!result.stdout.includes('Usage: dsh --profile web')) {
      fail(`DSH child ${index + 1} did not print web usage`)
    }
    if (result.stderr !== '') fail(`DSH child ${index + 1} wrote stderr: ${result.stderr}`)
  }

  const modulesDir = join(home, 'profiles', 'node_modules')
  const entries = await readdir(modulesDir, { recursive: true, withFileTypes: true })
  const links = entries.filter(entry => entry.isSymbolicLink())
  const temporary = entries.filter(entry => /^\..+\.\d+\.[0-9a-f]{12}$/.test(entry.name))
  if (temporary.length !== 0) fail(`expected no staged fallback entries, got ${temporary.length}`)
  JSON.parse(readFileSync(join(home, 'profiles', 'web', 'package.json'), 'utf8'))
  for (const name of ['cordis.patch.yml', 'pnpm-workspace.yaml']) {
    const contents = readFileSync(join(home, 'profiles', 'web', name), 'utf8')
    if (contents.trim() === '') fail(`${name} is empty`)
    yaml.load(contents)
  }
  for (const entry of links) {
    const linkPath = join(entry.parentPath, entry.name)
    const target = resolve(dirname(linkPath), readlinkSync(linkPath))
    if (!existsSync(target)) fail(`fallback link target is missing: ${linkPath}`)
  }

  const elapsedMs = Math.round(performance.now() - startedAt)
  process.stdout.write(`DSH concurrent cold boot passed: ${concurrency}/${concurrency}, ${links.length} links, ${elapsedMs}ms\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await rm(home, { recursive: true, force: true })
}
