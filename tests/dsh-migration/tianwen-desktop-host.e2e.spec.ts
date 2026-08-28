import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../..')
const enabled = process.platform === 'win32'
  && process.env.TIANWEN_DESKTOP_HOST_E2E === '1'

interface ElectronResult {
  readonly electronPid: number
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
}

interface StrictSpawnSyncOptions {
  readonly encoding: 'utf8'
  readonly shell: false
  readonly windowsHide: true
}

interface StrictSpawnSyncResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
  readonly error?: Error
}

type StrictSpawnSync = (
  program: string,
  args: readonly string[],
  options: StrictSpawnSyncOptions,
) => StrictSpawnSyncResult

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
  const executable = packageRequire('electron') as unknown
  if (typeof executable !== 'string' || !isAbsolute(executable)) {
    throw new Error('Electron did not resolve to an absolute executable path')
  }
  return realpathSync(executable)
}

function resolveDesktopLaunch(
  packagedExecutable: string | undefined,
  resolveDevelopmentExecutable = resolveElectronExecutable,
): {
  readonly executable: string
  readonly prefixArgs: readonly string[]
} {
  if (packagedExecutable !== undefined) {
    if (!isAbsolute(packagedExecutable)) {
      throw new Error('TIANWEN_DESKTOP_EXECUTABLE must be an absolute path')
    }
    return { executable: realpathSync(packagedExecutable), prefixArgs: [] }
  }
  return {
    executable: resolveDevelopmentExecutable(),
    prefixArgs: [
      join(repoRoot, 'packages', 'tianwen-desktop-host', 'dist', 'main.js'),
    ],
  }
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
    const electronPid = child.pid
    if (electronPid === undefined) {
      child.once('error', () => {})
      child.kill()
      rejectResult(new Error('Electron did not report its process ID'))
      return
    }
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
      resolveResult({ electronPid, code, signal, stdout, stderr })
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

function runSyncStrict(
  program: string,
  args: readonly string[],
  options: StrictSpawnSyncOptions,
): StrictSpawnSyncResult {
  const result = spawnSync(program, [...args], options)
  const output = {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
  return result.error === undefined ? output : { ...output, error: result.error }
}

function directNodeChildren(
  electronPid: number,
  dependencies: {
    readonly systemRoot?: string
    readonly runSync?: StrictSpawnSync
  } = {},
): number[] {
  if (!Number.isSafeInteger(electronPid) || electronPid <= 0) {
    throw new Error(`Invalid Electron PID: ${String(electronPid)}`)
  }
  const systemRoot = dependencies.systemRoot
    ?? process.env.SystemRoot
    ?? process.env.WINDIR
    ?? 'C:\\Windows'
  const powershell = join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )
  if (!isAbsolute(powershell)) throw new Error('Windows PowerShell path must be absolute')
  const command = `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${electronPid} AND Name = 'node.exe'" | Select-Object -ExpandProperty ProcessId | ConvertTo-Json -Compress`
  const result = (dependencies.runSync ?? runSyncStrict)(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command,
  ], { encoding: 'utf8', shell: false, windowsHide: true })
  if (result.status !== 0 || result.error !== undefined || result.stderr.trim() !== '') {
    throw new Error([
      `Direct Node child query exited ${String(result.status)}`,
      result.error?.message,
      result.stderr,
    ].filter(Boolean).join('\n'))
  }
  const output = result.stdout.trim()
  if (output === '') return []
  let decoded: unknown
  try {
    decoded = JSON.parse(output)
  } catch {
    throw new Error('Direct Node child query returned invalid JSON')
  }
  const values = Array.isArray(decoded) ? decoded : [decoded]
  if (values.some(pid => typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0)) {
    throw new Error('Direct Node child query returned an invalid PID')
  }
  return [...new Set(values as number[])]
}

function cleanupDesktopChildren(
  input: { readonly electronPid: number, readonly ownedDshPid?: number },
  dependencies: {
    readonly directNodeChildren?: (electronPid: number) => readonly number[]
    readonly processExists?: (pid: number) => boolean
    readonly terminateProcessTree?: (pid: number) => void
  } = {},
): void {
  const exactPid = input.ownedDshPid
  const candidates = exactPid !== undefined && Number.isSafeInteger(exactPid) && exactPid > 0
    ? [exactPid]
    : [...(dependencies.directNodeChildren ?? directNodeChildren)(input.electronPid)]
  const exists = dependencies.processExists ?? processExists
  const terminate = dependencies.terminateProcessTree ?? terminateProcessTree
  for (const pid of new Set(candidates)) {
    if (pid !== input.electronPid && exists(pid)) terminate(pid)
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

    const launch = resolveDesktopLaunch(process.env.TIANWEN_DESKTOP_EXECUTABLE)
    const result = await runElectron(launch.executable, [
      ...launch.prefixArgs,
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
      cleanupDesktopChildren(
        pid === undefined
          ? { electronPid: result.electronPid }
          : { electronPid: result.electronPid, ownedDshPid: pid },
      )
    }
  }, 240_000)
})

describe('Desktop launcher selection', () => {
  it('keeps packaged and development launch forms distinct', () => {
    const fixtureRoot = `D:\\DevData\\tianwen-desktop-launch-tests\\${crypto.randomUUID()}`
    const packagedExecutable = join(fixtureRoot, 'Tianwen Desktop.exe')
    const developmentExecutable = join(fixtureRoot, 'electron.exe')
    mkdirSync(fixtureRoot, { recursive: true })
    writeFileSync(packagedExecutable, '')
    writeFileSync(developmentExecutable, '')
    try {
      expect(resolveDesktopLaunch(packagedExecutable, () => {
        throw new Error('development Electron must not resolve for packaged launch')
      })).toEqual({
        executable: realpathSync(packagedExecutable),
        prefixArgs: [],
      })
      const development = resolveDesktopLaunch(
        undefined,
        () => realpathSync(developmentExecutable),
      )
      expect(development.executable).toBe(realpathSync(developmentExecutable))
      expect(development.prefixArgs.at(-1)).toMatch(/dist[\\/]main\.js$/u)
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true })
    }
  })
})

describe('Desktop child cleanup fallback', () => {
  it('prefers the emitted DSH PID without querying other Node processes', () => {
    const terminated: number[] = []
    cleanupDesktopChildren({ electronPid: 101, ownedDshPid: 202 }, {
      directNodeChildren: () => { throw new Error('unexpected CIM query') },
      processExists: () => true,
      terminateProcessTree: pid => { terminated.push(pid) },
    })
    expect(terminated).toEqual([202])
  })

  it('cleans only the Electron process direct Node children when the PID line is absent', () => {
    const queried: number[] = []
    const terminated: number[] = []
    cleanupDesktopChildren({ electronPid: 101 }, {
      directNodeChildren: pid => {
        queried.push(pid)
        return [303, 404]
      },
      processExists: pid => pid === 404,
      terminateProcessTree: pid => { terminated.push(pid) },
    })
    expect(queried).toEqual([101])
    expect(terminated).toEqual([404])
  })

  it('strictly parses direct Node child PIDs from the absolute CIM query', () => {
    let invocation: {
      readonly program: string
      readonly args: readonly string[]
      readonly options: StrictSpawnSyncOptions
    } | undefined
    const pids = directNodeChildren(101, {
      systemRoot: 'C:\\Windows',
      runSync: (program, args, options) => {
        invocation = { program, args, options }
        return { status: 0, stdout: '[303,404]\r\n', stderr: '' }
      },
    })
    expect(pids).toEqual([303, 404])
    expect(invocation).toEqual({
      program: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      args: [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        'Get-CimInstance Win32_Process -Filter "ParentProcessId = 101 AND Name = \'node.exe\'" | Select-Object -ExpandProperty ProcessId | ConvertTo-Json -Compress',
      ],
      options: { encoding: 'utf8', shell: false, windowsHide: true },
    })
  })
})
