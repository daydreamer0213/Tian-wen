import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs'
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveInstalledDshBin, verifyInstalledRuntimeBundle } from './resume.js'
import {
  CONTROLLED_LIFECYCLE_CHILD_OUTPUT_LIMIT_BYTES,
  parseControlledLifecycleChildReceipt,
  readControlledLifecycleManifest,
} from './controlled-lifecycle-contract.js'
import type { PreparedControlledLifecycleManifest } from './controlled-lifecycle-contract.js'

export interface ControlledLifecyclePreflight {
  readonly dataDir: string
  readonly dshBin: string
  readonly installedArchiveDigest: `sha256:${string}`
  readonly manifest: PreparedControlledLifecycleManifest
  readonly manifestPath: string
}

export interface ControlledLifecycleInvocation {
  readonly args: string[]
  readonly options: SpawnOptions
  readonly program: string
}

export interface ControlledLifecycleChildDependencies {
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
}

export class ControlledLifecyclePreflightError extends Error {
  readonly code = 'installed-receipt-mismatch' as const

  constructor() {
    super('controlled lifecycle preflight failed')
    this.name = 'ControlledLifecyclePreflightError'
  }
}

const INSTALL_RECEIPT_KEYS = [
  'archiveDigest', 'archivePath', 'binDir', 'cliPath', 'dataDir', 'dshVersion',
  'hostRoot', 'pnpmVersion', 'profileBundles', 'profileRoot', 'receiptPath',
  'schemaVersion', 'status',
] as const

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('installed Tianwen receipt is invalid')
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).toSorted()
  const wanted = [...expected].toSorted()
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index])
}

function sha256File(path: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
}

function strictChild(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && path !== '..' && !path.startsWith(`..\\`) && !isAbsolute(path)
}

export function preflightControlledLifecycle(
  manifestPathInput: string,
  dataDirInput: string,
): ControlledLifecyclePreflight {
  if (!isAbsolute(manifestPathInput) || !isAbsolute(dataDirInput)) {
    throw new TypeError('controlled lifecycle paths must be absolute')
  }
  const dataDir = resolve(dataDirInput)
  if (!strictChild(resolve('D:\\DevData'), dataDir)) {
    throw new TypeError('dataDir must be a strict child of D:\\DevData')
  }
  const realDevData = realpathSync(resolve('D:\\DevData'))
  const realDataDir = realpathSync(dataDir)
  if (!strictChild(realDevData, realDataDir)) {
    throw new TypeError('dataDir must resolve under D:\\DevData')
  }
  const dshBin = resolveInstalledDshBin(dataDir)
  const profileRoot = join(dataDir, 'dsh-home', 'profiles', 'tianwen')
  const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
  const evolutionRoot = join(dataDir, 'state', 'evolution')
  const runtimeRoot = join(
    profileRoot, 'node_modules', '@tianwen', 'runtime-bundle',
  )
  const archivePath = join(dataDir, 'packs', 'tianwen-runtime-bundle-0.1.5.tgz')
  const receiptPath = join(dataDir, 'receipts', 'tianwen-install.json')
  const cliPath = join(runtimeRoot, 'dist', 'cli.js')
  const runtimePath = join(runtimeRoot, 'dist', 'runtime.js')
  const runtimeManifest = record(JSON.parse(
    readFileSync(join(runtimeRoot, 'package.json'), 'utf8'),
  ) as unknown)
  if (
    runtimeManifest.name !== '@tianwen/runtime-bundle' ||
    runtimeManifest.version !== '0.1.5' ||
    record(runtimeManifest.bin).tianwen !== 'dist/cli.js'
  ) throw new TypeError('installed Tianwen Runtime Bundle is invalid')
  for (const path of [cliPath, runtimePath, archivePath]) {
    if (!lstatSync(path).isFile()) {
      throw new TypeError('installed Tianwen publication is incomplete')
    }
  }
  const realRuntimeRoot = realpathSync(runtimeRoot)
  const realCliPath = realpathSync(cliPath)
  if (
    !strictChild(realDataDir, realRuntimeRoot) ||
    !strictChild(realRuntimeRoot, realCliPath) ||
    !strictChild(realRuntimeRoot, realpathSync(runtimePath))
  ) throw new TypeError('installed Tianwen Runtime Bundle escapes its root')
  const profileManifest = record(JSON.parse(
    readFileSync(join(profileRoot, 'package.json'), 'utf8'),
  ) as unknown)
  const dependencies = record(profileManifest.dependencies)
  if (
    dependencies['@deepseek-ai/dsh-base'] !== '0.1.1-rc.2' ||
    dependencies['@deepseek-ai/dsh-headless'] !== '0.1.1-rc.2' ||
    dependencies['@tianwen/runtime-bundle'] !== '0.1.5' ||
    !lstatSync(join(profileRoot, 'cordis.patch.yml')).isFile() ||
    !lstatSync(join(profileRoot, 'node_modules', '.bin')).isDirectory()
  ) throw new TypeError('installed Tianwen Profile is incomplete')
  for (const ownerChain of [['dsh-home', 'sessions'], ['state', 'evolution']] as const) {
    let path = dataDir
    for (const segment of ownerChain) {
      path = join(path, segment)
      let pathStats: ReturnType<typeof lstatSync>
      try {
        pathStats = lstatSync(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') break
        throw error
      }
      if (
        !pathStats.isDirectory() || pathStats.isSymbolicLink() ||
        !strictChild(realDataDir, realpathSync(path))
      ) {
        throw new TypeError('installed Tianwen state root is invalid')
      }
    }
  }
  const receipt = record(JSON.parse(readFileSync(receiptPath, 'utf8')) as unknown)
  if (!exactKeys(receipt, INSTALL_RECEIPT_KEYS)) {
    throw new TypeError('installed Tianwen receipt has an invalid shape')
  }
  const archiveDigest = sha256File(archivePath)
  if (receipt.cliPath !== realCliPath) {
    throw new ControlledLifecyclePreflightError()
  }
  if (
    receipt.schemaVersion !== 'tianwen.install.v1' || receipt.status !== 'ready' ||
    receipt.archiveDigest !== archiveDigest || receipt.archivePath !== archivePath ||
    receipt.binDir !== join(profileRoot, 'node_modules', '.bin') ||
    receipt.dataDir !== dataDir ||
    receipt.dshVersion !== '0.1.1-rc.2' ||
    receipt.hostRoot !== join(dataDir, 'dsh-host') ||
    receipt.pnpmVersion !== '11.20.0' ||
    JSON.stringify(receipt.profileBundles) !== JSON.stringify([
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless',
      '@tianwen/runtime-bundle',
    ]) || receipt.profileRoot !== profileRoot || receipt.receiptPath !== receiptPath
  ) throw new TypeError('installed Tianwen receipt does not match the product')
  const manifestPath = resolve(manifestPathInput)
  const manifest = readControlledLifecycleManifest(manifestPath)
  const realOperationRoot = realpathSync(manifest.manifest.roots.operationRoot)
  const realManifestPath = realpathSync(manifestPath)
  if (
    manifest.manifest.roots.dataDir !== dataDir ||
    manifest.manifest.roots.sessionsRoot !== sessionsRoot ||
    manifest.manifest.roots.evolutionRoot !== evolutionRoot ||
    manifest.manifest.execution.dshVersion !== '0.1.1-rc.2' ||
    manifest.manifest.installedArchiveDigest !== archiveDigest ||
    !strictChild(realDataDir, realOperationRoot) ||
    !strictChild(realOperationRoot, realManifestPath)
  ) throw new TypeError('controlled lifecycle manifest does not match the installed product')
  return {
    dataDir,
    dshBin,
    installedArchiveDigest: archiveDigest,
    manifest,
    manifestPath,
  }
}

export function buildControlledLifecycleInvocation(
  preflight: ControlledLifecyclePreflight,
): ControlledLifecycleInvocation {
  return {
    program: process.execPath,
    args: [
      preflight.dshBin,
      '--profile',
      'tianwen',
      '--patch',
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../controlled-lifecycle.patch.yml',
      ),
    ],
    options: {
      env: {
        ...process.env,
        DSH_HOME: join(preflight.dataDir, 'dsh-home'),
        TIANWEN_CONTROLLED_DATA_DIR: preflight.dataDir,
        TIANWEN_CONTROLLED_JSON: 'true',
        TIANWEN_CONTROLLED_MANIFEST_DIGEST: preflight.manifest.manifestDigest,
        TIANWEN_CONTROLLED_MANIFEST_PATH: preflight.manifestPath,
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  }
}

export async function monitorControlledLifecycleChild(
  child: ChildProcess,
  expected: {
    readonly manifestDigest: `sha256:${string}`
    readonly installedArchiveDigest: `sha256:${string}`
  },
  dependencies: ControlledLifecycleChildDependencies = {},
): Promise<number> {
  const write = dependencies.write ?? (line => { process.stdout.write(line) })
  const writeError = dependencies.writeError ?? (line => { process.stderr.write(line) })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let stdoutBytes = 0
  let stderrBytes = 0
  let finished = false
  const rawChildStdout = child.stdout
  if (rawChildStdout === null) {
    writeError('tianwen controlled-lifecycle: child transport failed\n')
    return 1
  }
  const childStdout: NonNullable<ChildProcess['stdout']> = rawChildStdout
  const rawChildStderr = child.stderr
  if (rawChildStderr === null) {
    writeError('tianwen controlled-lifecycle: child transport failed\n')
    return 1
  }
  const childStderr: NonNullable<ChildProcess['stderr']> = rawChildStderr
  return await new Promise(resolveExit => {
    let exitCode: number | null | undefined
    let exitSignal: NodeJS.Signals | null | undefined
    let exitObserved = false
    let terminationRequested = false
    let stdoutEnded = false
    let stderrEnded = false
    function cleanup(): void {
      child.removeListener('error', fail)
      child.removeListener('exit', onExit)
      childStdout.removeListener('data', onStdoutData)
      childStdout.removeListener('end', onStdoutEnd)
      childStdout.removeListener('error', fail)
      childStdout.removeListener('close', onStdoutClose)
      childStderr.removeListener('data', onStderrData)
      childStderr.removeListener('end', onStderrEnd)
      childStderr.removeListener('error', fail)
      childStderr.removeListener('close', onStderrClose)
    }
    function fail(): void {
      if (finished) return
      finished = true
      if (!exitObserved && !terminationRequested) {
        terminationRequested = true
        try { child.kill() } catch {}
        try { childStdout.destroy() } catch {}
        try { childStderr.destroy() } catch {}
      }
      writeError('tianwen controlled-lifecycle: child transport failed\n')
      resolveExit(1)
    }
    function collect(chunks: Buffer[], chunk: Buffer, bytes: number): number {
      if (finished) return bytes
      const nextBytes = bytes + chunk.byteLength
      if (nextBytes > CONTROLLED_LIFECYCLE_CHILD_OUTPUT_LIMIT_BYTES) {
        fail()
        return bytes
      }
      chunks.push(chunk)
      return nextBytes
    }
    function maybeFinish(): void {
      if (
        finished || exitCode === undefined || exitSignal === undefined ||
        !stdoutEnded || !stderrEnded
      ) return
      try {
        const receipt = parseControlledLifecycleChildReceipt(
          Buffer.concat(stdout).toString('utf8'),
          Buffer.concat(stderr).toString('utf8'),
          expected,
        )
        const expectedCode = receipt.status === 'passed' ? 0 : 1
        if (exitSignal !== null || exitCode !== expectedCode) {
          fail()
          return
        }
        finished = true
        cleanup()
        write(`${JSON.stringify(receipt)}\n`)
        resolveExit(expectedCode)
      } catch { fail() }
    }
    function onExit(code: number | null, signal: NodeJS.Signals | null): void {
      exitObserved = true
      exitCode = code
      exitSignal = signal
      maybeFinish()
    }
    function onStdoutData(chunk: Buffer): void {
      stdoutBytes = collect(stdout, chunk, stdoutBytes)
    }
    function onStderrData(chunk: Buffer): void {
      stderrBytes = collect(stderr, chunk, stderrBytes)
    }
    function onStdoutEnd(): void {
      stdoutEnded = true
      maybeFinish()
    }
    function onStderrEnd(): void {
      stderrEnded = true
      maybeFinish()
    }
    function onStdoutClose(): void {
      if (!stdoutEnded) fail()
    }
    function onStderrClose(): void {
      if (!stderrEnded) fail()
    }
    child.on('error', fail)
    child.once('exit', onExit)
    childStdout.on('data', onStdoutData)
    childStderr.on('data', onStderrData)
    childStdout.once('end', onStdoutEnd)
    childStderr.once('end', onStderrEnd)
    childStdout.on('error', fail)
    childStderr.on('error', fail)
    childStdout.once('close', onStdoutClose)
    childStderr.once('close', onStderrClose)
  })
}

export async function launchControlledLifecycle(
  preflight: ControlledLifecyclePreflight,
): Promise<number> {
  verifyInstalledRuntimeBundle(preflight.dataDir)
  const invocation = buildControlledLifecycleInvocation(preflight)
  const child = spawn(invocation.program, invocation.args, invocation.options)
  return monitorControlledLifecycleChild(child, {
    manifestDigest: preflight.manifest.manifestDigest,
    installedArchiveDigest: preflight.installedArchiveDigest,
  })
}
