import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const repoRoot = resolve(import.meta.dirname, '../..')
const fixtureBase = resolve(
  'D:/DevData/tianwen-portable-profile-composition-tests',
)
const controllerDshManifestPath = realpathSync(
  require.resolve('@deepseek-ai/dsh/package.json'),
)
const controllerDshManifest = JSON.parse(
  readFileSync(controllerDshManifestPath, 'utf8'),
) as { readonly bin: { readonly dsh: string }; readonly version: string }
const enabled = process.platform === 'win32'
  && process.env.TIANWEN_RUN_PORTABLE_COMPOSITION_E2E === '1'

interface ProbeReceipt {
  readonly schemaVersion: 'tianwen.portable-composition-probe.v1'
  readonly surface: 'headless' | 'web'
  readonly runtimeEntries: number
  readonly services: {
    readonly evidence: boolean
    readonly evolution: boolean
    readonly learningIntake: boolean
    readonly skillEvaluation: boolean
  }
  readonly dynamicCordisRunner: boolean
  readonly baseUrl: string
}

interface RunningDsh {
  readonly child: ChildProcessWithoutNullStreams
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  readonly output: () => { stdout: string; stderr: string }
}

interface InstalledProfile {
  readonly home: string
  readonly profileRoot: string
  readonly environmentRoot: string
}

interface ProfileManifest {
  readonly dependencies?: Record<string, string>
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
}

let fixtureRoot = ''
let dshBin = ''
let runtimeTarball = ''
let probeTarball = ''
let pnpmStore = ''

function run(command: string, args: readonly string[], cwd = repoRoot): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: pnpmStore === '' ? process.env : {
      ...process.env,
      PNPM_CONFIG_STORE_DIR: pnpmStore,
    },
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} exited ${String(result.status)}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'))
  }
  return result.stdout
}

function installStockDshHost(): void {
  const hostRoot = join(fixtureRoot, 'dsh-host')
  mkdirSync(hostRoot, { recursive: true })
  writeFileSync(join(hostRoot, 'package.json'), `${JSON.stringify({
    name: 'tianwen-portable-composition-dsh-host',
    private: true,
  }, null, 2)}\n`, 'utf8')
  writeFileSync(join(hostRoot, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - .',
    'allowBuilds:',
    "  '@deepseek-ai/dsh-subprocess-local': false",
    "  '@google/genai': false",
    '  koffi: true',
    '  node-pty: false',
    '  protobufjs: false',
    '',
  ].join('\n'), 'utf8')
  run('pnpm', [
    '--dir', hostRoot,
    '--allow-build=koffi', 'add', '--save-exact',
    '@deepseek-ai/dsh@0.1.1-rc.2',
  ])
  const hostRequire = createRequire(join(hostRoot, 'package.json'))
  const manifestPath = realpathSync(
    hostRequire.resolve('@deepseek-ai/dsh/package.json'),
  )
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    readonly bin: { readonly dsh: string }
    readonly version: string
  }
  expect(manifest.version).toBe('0.1.1-rc.2')
  dshBin = realpathSync(resolve(dirname(manifestPath), manifest.bin.dsh))
  expect(dshBin.startsWith(realpathSync(hostRoot))).toBe(true)
}

function buildAndPackBundles(): void {
  const packRoot = join(fixtureRoot, 'packs')
  mkdirSync(packRoot, { recursive: true })
  run('pnpm', ['--filter', '@tianwen/runtime-bundle...', 'build'])
  run('pnpm', ['--filter', '@tianwen/dsh-probe-bundle', 'build'])
  run('pnpm', [
    '--dir', 'packages/tianwen-runtime-bundle',
    'pack', '--pack-destination', packRoot,
  ])
  run('pnpm', [
    '--dir', 'packages/tianwen-dsh-probe-bundle',
    'pack', '--pack-destination', packRoot,
  ])
  runtimeTarball = join(packRoot, 'tianwen-runtime-bundle-0.1.9.tgz')
  probeTarball = join(packRoot, 'tianwen-dsh-probe-bundle-0.0.0.tgz')
  expect(existsSync(runtimeTarball)).toBe(true)
  expect(existsSync(probeTarball)).toBe(true)
}

function baseEnvironment(home: string, environmentRoot: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.DEEPSEEK_API_KEY
  delete env.DEEPSEEK_BASE_URL
  delete env.DEEPSEEK_MODEL
  mkdirSync(join(environmentRoot, 'temp'), { recursive: true })
  return {
    ...env,
    DSH_HOME: home,
    DSH_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
    PNPM_CONFIG_STORE_DIR:
      process.env.PNPM_CONFIG_STORE_DIR ?? pnpmStore,
    TEMP: join(environmentRoot, 'temp'),
    TMP: join(environmentRoot, 'temp'),
  }
}

function installProfile(profile: 'headless' | 'web'): InstalledProfile {
  const home = join(fixtureRoot, `${profile}-home`)
  const profileRoot = join(home, 'profiles', profile)
  const environmentRoot = join(fixtureRoot, `${profile}-environment`)
  mkdirSync(home, { recursive: true })
  const env = baseEnvironment(home, environmentRoot)
  const add = (label: string, packagePath: string): void => {
    const result = spawnSync(process.execPath, [
      dshBin,
      'plugin', '--profile', profile,
      '--allow-build=koffi', 'add', '--offline', packagePath,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
      shell: false,
      windowsHide: true,
    })
    if (result.status !== 0) {
      throw new Error([
        `dsh plugin --profile ${profile} add ${label} exited ${String(result.status)}`,
        result.stdout,
        result.stderr,
      ].filter(Boolean).join('\n'))
    }
  }

  add('Runtime Bundle', runtimeTarball)
  const runtimeOnly = JSON.parse(
    readFileSync(join(profileRoot, 'package.json'), 'utf8'),
  ) as ProfileManifest
  expect(runtimeOnly.dependencies?.['@tianwen/runtime-bundle']).toBeDefined()
  expect(runtimeOnly.dependencies?.['@tianwen/dsh-probe-bundle']).toBeUndefined()
  expect(runtimeOnly.dsh?.profile?.bundles?.filter(
    name => name === '@tianwen/runtime-bundle',
  )).toHaveLength(1)

  add('composition probe', probeTarball)
  const manifest = JSON.parse(
    readFileSync(join(profileRoot, 'package.json'), 'utf8'),
  ) as ProfileManifest
  expect(manifest.dependencies?.['@tianwen/runtime-bundle']).toBeDefined()
  expect(manifest.dependencies?.['@tianwen/dsh-probe-bundle']).toBeDefined()
  expect(manifest.dsh?.profile?.bundles?.filter(
    name => name === '@tianwen/runtime-bundle',
  )).toHaveLength(1)
  expect(realpathSync(join(
    profileRoot,
    'node_modules', '@tianwen', 'runtime-bundle', 'package.json',
  )).startsWith(realpathSync(profileRoot))).toBe(true)
  return { home, profileRoot, environmentRoot }
}

function launchDsh(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): RunningDsh {
  const child = spawn(process.execPath, [dshBin, ...args], {
    cwd: repoRoot,
    env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdin.end()
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  const exited = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveExit({ code, signal }))
  })
  return { child, exited, output: () => ({ stdout, stderr }) }
}

async function waitFor<T>(
  running: RunningDsh,
  read: () => T | undefined,
  label: string,
  timeoutMs = 120_000,
): Promise<T> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = read()
    if (value !== undefined) return value
    if (running.child.exitCode !== null || running.child.signalCode !== null) {
      const output = running.output()
      throw new Error([
        `dsh exited before ${label}`,
        output.stdout,
        output.stderr,
      ].filter(Boolean).join('\n'))
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 50))
  }
  const output = running.output()
  throw new Error([
    `timed out waiting for ${label}`,
    output.stdout,
    output.stderr,
  ].filter(Boolean).join('\n'))
}

async function waitForReceipt(
  running: RunningDsh,
  receiptPath: string,
): Promise<ProbeReceipt> {
  return waitFor(running, () => {
    if (!existsSync(receiptPath)) return undefined
    return JSON.parse(readFileSync(receiptPath, 'utf8')) as ProbeReceipt
  }, 'the composition probe receipt')
}

async function waitForHttp(url: string): Promise<Response> {
  let lastError: unknown
  const startedAt = Date.now()
  while (Date.now() - startedAt < 30_000) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(1_000) })
    } catch (error) {
      lastError = error
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    }
  }
  throw new Error(`timed out waiting for ${url}`, { cause: lastError })
}

async function stopAfterFailure(running: RunningDsh, stopPath: string): Promise<void> {
  if (running.child.exitCode !== null || running.child.signalCode !== null) return
  writeFileSync(stopPath, '', { flag: 'a' })
  const stopped = await Promise.race([
    running.exited.then(() => true),
    new Promise<false>(resolveWait => setTimeout(() => resolveWait(false), 10_000)),
  ])
  if (stopped) return
  spawnSync('taskkill.exe', [
    '/PID', String(running.child.pid), '/T', '/F',
  ], { shell: false, windowsHide: true })
  const terminated = await Promise.race([
    running.exited.then(() => true),
    new Promise<false>(resolveWait => setTimeout(() => resolveWait(false), 10_000)),
  ])
  if (!terminated) {
    throw new Error(`failed to terminate dsh process tree ${String(running.child.pid)}`)
  }
}

beforeAll(() => {
  if (!enabled) return
  expect(controllerDshManifest.version).toBe('0.1.1-rc.2')
  mkdirSync(fixtureBase, { recursive: true })
  fixtureRoot = mkdtempSync(join(fixtureBase, 'run-'))
  pnpmStore = run('pnpm', ['store', 'path']).trim()
  expect(pnpmStore.toUpperCase().startsWith('D:\\')).toBe(true)
  installStockDshHost()
  buildAndPackBundles()
}, 300_000)

afterAll(() => {
  if (fixtureRoot !== '') {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
}, 120_000)

describe.skipIf(!enabled)
  .sequential('portable stock DSH profile composition', () => {
    it('boots stock headless with Tianwen once and no dynamic runner', async () => {
      const profile = installProfile('headless')
      const receiptPath = join(profile.environmentRoot, 'headless-receipt.json')
      const stopPath = join(profile.environmentRoot, 'headless-stop')
      const overlayPath = join(profile.environmentRoot, 'headless-probe.patch.yml')
      writeFileSync(overlayPath, [
        '- id: headless-startup',
        '  disabled: true',
        '- id: headless-runner',
        '  disabled: true',
        '',
      ].join('\n'), 'utf8')
      const env = {
        ...baseEnvironment(profile.home, profile.environmentRoot),
        TIANWEN_COMPOSITION_PROBE_EXIT_AFTER_RECEIPT: 'true',
        TIANWEN_COMPOSITION_PROBE_RECEIPT: receiptPath,
        TIANWEN_COMPOSITION_PROBE_STOP: stopPath,
        TIANWEN_COMPOSITION_PROBE_SURFACE: 'headless',
      }
      const running = launchDsh([
        '--profile', 'headless', '--patch', overlayPath,
      ], env)
      try {
        const receipt = await waitForReceipt(running, receiptPath)
        expect(receipt).toMatchObject({
          schemaVersion: 'tianwen.portable-composition-probe.v1',
          surface: 'headless',
          runtimeEntries: 1,
          services: {
            evidence: true,
            evolution: true,
            learningIntake: true,
            skillEvaluation: true,
          },
          dynamicCordisRunner: false,
        })
        expect(realpathSync(fileURLToPath(receipt.baseUrl))).toBe(
          realpathSync(profile.profileRoot),
        )
        await expect(running.exited).resolves.toEqual({ code: 0, signal: null })
        expect(existsSync(join(
          profile.profileRoot,
          'state', 'evolution', 'artifacts',
        ))).toBe(true)
      } finally {
        await stopAfterFailure(running, stopPath)
      }
    }, 180_000)

    it('serves stock Web over loopback with the same Tianwen tarball once', async () => {
      const profile = installProfile('web')
      const receiptPath = join(profile.environmentRoot, 'web-receipt.json')
      const stopPath = join(profile.environmentRoot, 'web-stop')
      const env = {
        ...baseEnvironment(profile.home, profile.environmentRoot),
        TIANWEN_COMPOSITION_PROBE_EXIT_AFTER_RECEIPT: 'false',
        TIANWEN_COMPOSITION_PROBE_RECEIPT: receiptPath,
        TIANWEN_COMPOSITION_PROBE_STOP: stopPath,
        TIANWEN_COMPOSITION_PROBE_SURFACE: 'web',
      }
      const running = launchDsh([
        'web', '--host', '127.0.0.1', '--port', '0', '--no-open',
      ], env)
      try {
        const receipt = await waitForReceipt(running, receiptPath)
        const url = await waitFor(running, () => (
          /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/u
            .exec(running.output().stdout)?.[1]
        ), 'the Web URL')
        const response = await waitForHttp(url)
        expect(response.status).toBe(200)
        expect((await response.text()).length).toBeGreaterThan(0)
        expect(receipt).toMatchObject({
          schemaVersion: 'tianwen.portable-composition-probe.v1',
          surface: 'web',
          runtimeEntries: 1,
          services: {
            evidence: true,
            evolution: true,
            learningIntake: true,
            skillEvaluation: true,
          },
          dynamicCordisRunner: true,
        })
        expect(realpathSync(fileURLToPath(receipt.baseUrl))).toBe(
          realpathSync(profile.profileRoot),
        )
        expect(existsSync(join(
          profile.profileRoot,
          'state', 'evolution', 'artifacts',
        ))).toBe(true)
        writeFileSync(stopPath, '')
        await expect(running.exited).resolves.toEqual({ code: 0, signal: null })
      } finally {
        await stopAfterFailure(running, stopPath)
      }
    }, 180_000)
  })
