import { execFileSync, spawn as nodeSpawn } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { SpawnOptions } from 'node:child_process'

const dshVersion = '0.1.1-rc.2'
const runtimePackage = '@tianwen/runtime-bundle'
const runtimeVersion = '0.1.0'
const maxStartupOutputBytes = 64 * 1024
const readinessTimeoutMs = 120_000
const gracefulStopTimeoutMs = 5_000

export const DESKTOP_WINDOW_OPTIONS = {
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
} as const

export function desktopNavigationAllowed(url: string, readyUrl: URL): boolean {
  try {
    return readyUrl.protocol === 'http:' && ['127.0.0.1', '[::1]', '::1'].includes(readyUrl.hostname) &&
      new URL(url).origin === readyUrl.origin
  } catch {
    return false
  }
}

export interface DesktopShutdownDependencies {
  stop(): Promise<void>
  exit(code: number): void
  report(message: string): void
}

export function createDesktopShutdownCoordinator(dependencies: DesktopShutdownDependencies): () => Promise<void> {
  let shutdown: Promise<void> | undefined
  return (): Promise<void> => {
    if (shutdown !== undefined) return shutdown
    shutdown = dependencies.stop().then(
      () => { dependencies.exit(0) },
      error => {
        dependencies.report(`Tianwen Desktop failed to stop: ${error instanceof Error ? error.message : String(error)}`)
        dependencies.exit(1)
      },
    )
    return shutdown
  }
}

export interface DesktopTargetInput {
  readonly nodeExecutable: string
  readonly dshRoot: string
  readonly dshHome: string
}

export interface DesktopTarget extends DesktopTargetInput {
  readonly dshBin: string
  readonly profileRoot: string
}

export interface DesktopWebHost {
  readonly pid: number
  readonly url: URL
  readonly exited: Promise<{ readonly code: number | null, readonly signal: NodeJS.Signals | null }>
  stop(): Promise<void>
}

export interface DesktopHostDependencies {
  readonly spawn?: typeof import('node:child_process').spawn
  readonly stopTree?: (pid: number) => Promise<void>
  readonly setTimeout?: typeof globalThis.setTimeout
  readonly clearTimeout?: typeof globalThis.clearTimeout
}

function fail(message: string): never {
  throw new Error(`Invalid Tianwen Desktop target: ${message}`)
}

function pathToExistingFile(path: string, label: string): string {
  if (!isAbsolute(path)) fail(`${label} must be absolute`)
  const resolved = realpathSync(path)
  if (!statSync(resolved).isFile()) fail(`${label} must be a file`)
  return resolved
}

function pathToExistingDirectory(path: string, label: string): string {
  if (!isAbsolute(path)) fail(`${label} must be absolute`)
  const resolved = realpathSync(path)
  if (!statSync(resolved).isDirectory()) fail(`${label} must be a directory`)
  return resolved
}

function isWithin(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function readManifest(path: string, label: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is not an object`)
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid Tianwen Desktop target:')) throw error
    fail(`${label} is unreadable`)
  }
}

function hasRuntimeDeclaration(value: unknown): boolean {
  if (Array.isArray(value)) return value.includes(runtimePackage)
  return value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, runtimePackage)
}

export function parseDesktopArgs(argv: readonly string[]): DesktopTargetInput {
  const values: Partial<Record<'nodeExecutable' | 'dshRoot' | 'dshHome', string>> = {}
  const names = new Map([
    ['--node', 'nodeExecutable'],
    ['--dsh-root', 'dshRoot'],
    ['--dsh-home', 'dshHome'],
  ] as const)
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const key = flag === undefined ? undefined : names.get(flag as '--node' | '--dsh-root' | '--dsh-home')
    const value = argv[index + 1]
    if (key === undefined || value === undefined || value.startsWith('--') || values[key] !== undefined) {
      throw new Error('Expected exactly --node, --dsh-root, and --dsh-home with one value each')
    }
    values[key] = value
  }
  if (argv.length !== 6 || values.nodeExecutable === undefined || values.dshRoot === undefined || values.dshHome === undefined) {
    throw new Error('Expected exactly --node, --dsh-root, and --dsh-home with one value each')
  }
  return { nodeExecutable: values.nodeExecutable, dshRoot: values.dshRoot, dshHome: values.dshHome }
}

export function resolveDesktopTarget(input: DesktopTargetInput): DesktopTarget {
  const nodeExecutable = pathToExistingFile(input.nodeExecutable, 'node executable')
  try {
    if (!/^v22\.\d+\.\d+\s*$/u.test(execFileSync(nodeExecutable, ['--version'], {
      encoding: 'utf8', shell: false, windowsHide: true,
    }))) fail('node executable must report v22.x')
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid Tianwen Desktop target:')) throw error
    fail('node executable must report v22.x')
  }
  const dshRoot = pathToExistingDirectory(input.dshRoot, 'DSH root')
  const dshHome = pathToExistingDirectory(input.dshHome, 'DSH home')
  const dshManifest = readManifest(join(dshRoot, 'package.json'), 'DSH manifest')
  const bin = dshManifest.bin
  if (dshManifest.name !== '@deepseek-ai/dsh' || dshManifest.version !== dshVersion || bin === null || typeof bin !== 'object' || Array.isArray(bin) || typeof (bin as Record<string, unknown>).dsh !== 'string') {
    fail('DSH manifest is not the required exact package')
  }
  const dshBinEntry = (bin as Record<string, unknown>).dsh
  if (dshBinEntry !== 'lib/bin.js') fail('DSH manifest is not the required exact package')
  const dshBin = realpathSync(resolve(dshRoot, dshBinEntry))
  if (!isWithin(dshRoot, dshBin) || !statSync(dshBin).isFile()) fail('DSH bin.dsh escapes the package')

  const profileRoot = realpathSync(join(dshHome, 'profiles', 'web'))
  if (!statSync(profileRoot).isDirectory() || !isWithin(dshHome, profileRoot)) fail('Web Profile is missing')
  const profile = readManifest(join(profileRoot, 'package.json'), 'Web Profile manifest')
  const dsh = profile.dsh
  const bundles = dsh !== null && typeof dsh === 'object' && !Array.isArray(dsh) &&
    (dsh as Record<string, unknown>).profile !== null && typeof (dsh as Record<string, unknown>).profile === 'object' &&
    !Array.isArray((dsh as Record<string, unknown>).profile)
    ? ((dsh as { profile: { bundles?: unknown } }).profile.bundles)
    : undefined
  if (!Array.isArray(bundles) || bundles.filter(bundle => bundle === runtimePackage).length !== 1) {
    fail('Web Profile must declare the Runtime bundle exactly once')
  }
  if (!hasRuntimeDeclaration(profile.dependencies) || (profile.dependencies as Record<string, unknown>)[runtimePackage] !== runtimeVersion) {
    fail('Web Profile must declare the exact Runtime dependency')
  }
  for (const section of ['devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies'] as const) {
    if (hasRuntimeDeclaration(profile[section])) fail(`Web Profile cannot declare Runtime in ${section}`)
  }
  const runtimeRoot = realpathSync(join(profileRoot, 'node_modules', '@tianwen', 'runtime-bundle'))
  if (!isWithin(profileRoot, runtimeRoot) || !statSync(runtimeRoot).isDirectory()) fail('Runtime directory escapes Web Profile')
  const runtime = readManifest(join(runtimeRoot, 'package.json'), 'Runtime manifest')
  if (runtime.name !== runtimePackage || runtime.version !== runtimeVersion) fail('Runtime manifest is not the required exact package')
  return { nodeExecutable, dshRoot, dshHome, dshBin, profileRoot }
}

function defaultStopTree(pid: number): Promise<void> {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows'
  const taskkill = join(systemRoot, 'System32', 'taskkill.exe')
  return new Promise((resolveStop, rejectStop) => {
    const child = nodeSpawn(taskkill, ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true })
    child.once('error', rejectStop)
    child.once('exit', code => code === 0 ? resolveStop() : rejectStop(new Error(`taskkill exited ${code}`)))
  })
}

function loopbackUrl(output: string): URL | undefined {
  const match = output.match(/(?:https?:\/\/[^\s]+|file:\/\/[^\s]+|data:[^\s]+)/u)
  if (match === null) return undefined
  let url: URL
  try {
    url = new URL(match[0])
  } catch {
    throw new Error('DSH Web emitted an invalid readiness URL')
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', '::1'].includes(url.hostname)) {
    throw new Error('DSH Web readiness URL must be loopback HTTP')
  }
  return url
}

export function startDesktopWebHost(target: DesktopTarget, dependencies: DesktopHostDependencies = {}): Promise<DesktopWebHost> {
  const spawn = dependencies.spawn ?? nodeSpawn
  const setTimer = dependencies.setTimeout ?? globalThis.setTimeout
  const clearTimer = dependencies.clearTimeout ?? globalThis.clearTimeout
  const options: SpawnOptions = {
    env: { ...process.env, DSH_HOME: target.dshHome, DSH_TELEMETRY_DISABLED: '1' },
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
  const child = spawn(target.nodeExecutable, [target.dshBin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], options)
  const stdout = child.stdout
  const stderr = child.stderr
  if (child.pid === undefined || stdout === null || stderr === null) return Promise.reject(new Error('Could not start DSH Web'))
  let exited = false
  let stopPromise: Promise<void> | undefined
  let resolveExited: (result: { readonly code: number | null, readonly signal: NodeJS.Signals | null }) => void
  const exitedPromise = new Promise<{ readonly code: number | null, readonly signal: NodeJS.Signals | null }>(resolve => { resolveExited = resolve })
  child.once('exit', (code, signal) => {
    exited = true
    resolveExited!({ code, signal })
  })
  const stopOwnedProcess = (): Promise<void> => {
    if (stopPromise !== undefined) return stopPromise
    stopPromise = (async () => {
      if (exited) return
      child.kill()
      if (!exited) {
        await new Promise<void>(resolveWait => {
          let timer: ReturnType<typeof setTimer> | undefined
          const finish = (): void => {
            if (timer !== undefined) clearTimer(timer)
            resolveWait()
          }
          void exitedPromise.then(finish)
          timer = setTimer(finish, gracefulStopTimeoutMs)
          if (exited) clearTimer(timer)
        })
      }
      if (!exited) await (dependencies.stopTree ?? defaultStopTree)(child.pid!)
    })()
    return stopPromise
  }

  return new Promise((resolveHost, rejectHost) => {
    let ready = false
    let settled = false
    let bytes = 0
    let output = ''
    const timeout = setTimer(() => reject(new Error('DSH Web did not become ready within 120 seconds')), readinessTimeoutMs)
    const reject = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimer(timeout)
      void stopOwnedProcess().then(() => rejectHost(error), () => rejectHost(error))
    }
    const onOutput = (chunk: Buffer | string): void => {
      if (ready) return
      bytes += Buffer.byteLength(chunk)
      if (bytes > maxStartupOutputBytes) {
        reject(new Error('DSH Web emitted more than 64 KiB before readiness'))
        return
      }
      try {
        output += String(chunk)
        const url = loopbackUrl(output)
        if (url === undefined) return
        ready = true
        settled = true
        clearTimer(timeout)
        resolveHost({
          pid: child.pid!,
          url,
          exited: exitedPromise,
          stop: stopOwnedProcess,
        })
      } catch (error) {
        reject(error instanceof Error ? error : new Error('DSH Web readiness failed'))
      }
    }
    stdout.on('data', onOutput)
    stderr.on('data', onOutput)
    child.once('error', error => reject(error))
    child.once('exit', (code, signal) => reject(new Error(`DSH Web exited before readiness (${code ?? signal ?? 'unknown'})`)))
  })
}
