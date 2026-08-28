import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../..')
const enabled = process.platform === 'win32'
  && process.env.TIANWEN_DESKTOP_HOST_E2E === '1'

interface ElectronResult {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
}

function requiredPath(name: string): string {
  const value = process.env[name]
  if (value === undefined || !isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`)
  }
  return realpathSync(value)
}

function resolveElectronExecutable(): string {
  const packageRequire = createRequire(join(
    repoRoot,
    'packages',
    'tianwen-desktop-host',
    'package.json',
  ))
  const manifestPath = realpathSync(
    packageRequire.resolve('electron/package.json'),
  )
  const packageRoot = dirname(manifestPath)
  const executablePath = readFileSync(join(packageRoot, 'path.txt'), 'utf8').trim()
  return realpathSync(join(packageRoot, 'dist', executablePath))
}

function childEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_OVERRIDE_DIST_PATH
  delete env.NODE_OPTIONS
  for (const name of Object.keys(env)) {
    if (/(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN)$/iu.test(name)
      || /^(?:DEEPSEEK|OPENAI|ANTHROPIC|GEMINI|GOOGLE_GENERATIVE_AI|AZURE_OPENAI|AWS_BEDROCK|GROQ|MISTRAL|COHERE|TOGETHER|XAI|MOONSHOT|DASHSCOPE|ARK)_/iu.test(name)) {
      delete env[name]
    }
  }
  env.TIANWEN_DESKTOP_E2E_EXIT_AFTER_LOAD = '1'
  return env
}

function buildDesktop(): void {
  const packageRequire = createRequire(join(repoRoot, 'package.json'))
  const tsc = realpathSync(packageRequire.resolve('typescript/bin/tsc'))
  const result = spawnSync(process.execPath, [
    tsc,
    '-b',
    join(repoRoot, 'packages', 'tianwen-desktop-host', 'tsconfig.json'),
    '--pretty',
    'false',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: childEnvironment(),
    shell: false,
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error([
      `Desktop build exited ${String(result.status)}`,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'))
  }
}

function runElectron(
  executable: string,
  args: readonly string[],
): Promise<ElectronResult> {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(executable, args, {
      cwd: repoRoot,
      env: childEnvironment(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    const timeout = setTimeout(() => {
      if (child.pid !== undefined) {
        spawnSync('taskkill.exe', [
          '/PID', String(child.pid), '/T', '/F',
        ], { shell: false, windowsHide: true })
      }
      rejectResult(new Error([
        'Electron did not exit within 210 seconds',
        stdout,
        stderr,
      ].filter(Boolean).join('\n')))
    }, 210_000)
    child.once('error', error => {
      clearTimeout(timeout)
      rejectResult(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      resolveResult({ code, signal, stdout, stderr })
    })
  })
}

function processExists(pid: number): boolean {
  const result = spawnSync('tasklist.exe', [
    '/FI',
    `PID eq ${pid}`,
    '/FO',
    'CSV',
    '/NH',
  ], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`tasklist exited ${String(result.status)}: ${result.stderr}`)
  }
  return result.stdout.includes(`"${pid}"`)
}

function terminateProcessTree(pid: number): void {
  const result = spawnSync('taskkill.exe', [
    '/PID', String(pid), '/T', '/F',
  ], { encoding: 'utf8', shell: false, windowsHide: true })
  if (result.status !== 0 && processExists(pid)) {
    throw new Error(`taskkill exited ${String(result.status)}: ${result.stderr}`)
  }
}

async function closedHttpAttempts(url: string): Promise<number> {
  let failures = 0
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      await response.body?.cancel()
    } catch {
      failures += 1
    }
  }
  return failures
}

describe.skipIf(!enabled).sequential('Tianwen Desktop host on Windows', () => {
  it('opens the prepared Web Profile and closes its owned DSH process', async () => {
    const nodeExecutable = requiredPath('TIANWEN_DESKTOP_HOST_NODE')
    const dshRoot = requiredPath('TIANWEN_DESKTOP_HOST_DSH_ROOT')
    const dshHome = requiredPath('TIANWEN_DESKTOP_HOST_DSH_HOME')
    buildDesktop()

    const result = await runElectron(resolveElectronExecutable(), [
      join(repoRoot, 'packages', 'tianwen-desktop-host', 'dist', 'main.js'),
      '--node', nodeExecutable,
      '--dsh-root', dshRoot,
      '--dsh-home', dshHome,
    ])

    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
    const pidText = /Tianwen Desktop owns DSH PID (\d+)/u.exec(result.stdout)?.[1]
    const pid = pidText === undefined ? undefined : Number(pidText)
    const url = /Tianwen Desktop ready at (http:\/\/127\.0\.0\.1:\d+\/?)\s*/u.exec(result.stdout)?.[1]
    let pidAliveAfterExit: boolean | undefined
    let closedAttempts: number | undefined
    try {
      if (pid !== undefined && Number.isSafeInteger(pid)) {
        pidAliveAfterExit = processExists(pid)
      }
      if (url !== undefined) closedAttempts = await closedHttpAttempts(url)

      expect(result.code, result.stderr).toBe(0)
      expect(result.signal).toBeNull()
      expect(pid !== undefined && Number.isSafeInteger(pid)).toBe(true)
      expect(url).toBeDefined()
      expect(pidAliveAfterExit).toBe(false)
      expect(closedAttempts).toBe(3)
    } finally {
      if (pid !== undefined && Number.isSafeInteger(pid) && processExists(pid)) {
        terminateProcessTree(pid)
      }
    }
  }, 240_000)
})
