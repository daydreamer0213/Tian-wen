import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalJson,
  createInstallReceipt,
  deriveInstallPaths,
  installTianwen,
  parseInstallerArgs,
  renderProfilePatch,
  validateInstalledHost,
} from '../../scripts/install-tianwen.mjs'

const testRoots: string[] = []

function testRoot(name: string): string {
  const root = `D:\\DevData\\tianwen-installer-tests\\${name}-${crypto.randomUUID()}`
  testRoots.push(root)
  return root
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`, 'utf8')
}

function scriptedInstaller(paths: ReturnType<typeof deriveInstallPaths>, failOn?: string) {
  const calls: string[][] = []
  const childEnvironments: NodeJS.ProcessEnv[] = []
  const executables: string[] = []
  const runner = (executable: string, argv: string[], options: {
    env: NodeJS.ProcessEnv
    shell: boolean
  }) => {
    expect(options.shell).toBe(false)
    childEnvironments.push(options.env)
    executables.push(executable)
    calls.push([...argv])
    if (failOn !== undefined && argv.includes(failOn)) {
      return { status: 12, stderr: 'scripted failure', stdout: '' }
    }
    if (argv[1] === '--version') return { status: 0, stderr: '', stdout: '11.20.0\n' }
    if (argv.includes('deploy')) {
      const packageRoot = join(paths.hostRoot, 'node_modules', '@deepseek-ai', 'dsh')
      mkdirSync(join(packageRoot, 'lib'), { recursive: true })
      writeFileSync(join(packageRoot, 'lib', 'bin.js'), 'export {}\n', 'utf8')
      writeJson(join(packageRoot, 'package.json'), {
        bin: { dsh: 'lib/bin.js' },
        version: '0.1.0-rc.6',
      })
    }
    if (argv.includes('pack')) {
      const destination = argv.at(argv.indexOf('--pack-destination') + 1)
      expect(destination).toBeTypeOf('string')
      mkdirSync(destination!, { recursive: true })
      writeFileSync(join(destination!, 'tianwen-runtime-bundle-0.0.0.tgz'), 'fixed runtime archive\n', 'utf8')
    }
    if (argv.includes('plugin')) {
      writeJson(join(paths.profileRoot, 'package.json'), {
        dependencies: {
          '@deepseek-ai/dsh-base': '0.1.0-rc.6',
          '@deepseek-ai/dsh-headless': '0.1.0-rc.6',
          '@tianwen/runtime-bundle': `file:${paths.archivePath.replaceAll('\\', '/')}`,
        },
        dsh: {
          profile: {
            bundles: [
              '@deepseek-ai/dsh-base',
              '@deepseek-ai/dsh-headless',
              '@tianwen/runtime-bundle',
            ],
          },
        },
      })
      const runtimeRoot = join(paths.profileRoot, 'node_modules', '@tianwen', 'runtime-bundle')
      mkdirSync(join(runtimeRoot, 'dist'), { recursive: true })
      writeFileSync(join(runtimeRoot, 'dist', 'runtime.js'), 'export default {}\n', 'utf8')
      writeFileSync(join(runtimeRoot, 'dist', 'cli.js'), 'export {}\n', 'utf8')
      mkdirSync(paths.binDir, { recursive: true })
      writeFileSync(join(paths.binDir, 'tianwen.CMD'), '@echo off\r\n', 'utf8')
      writeJson(join(runtimeRoot, 'package.json'), {
        bin: { tianwen: 'dist/cli.js' },
        exports: { './runtime': './dist/runtime.js' },
        name: '@tianwen/runtime-bundle',
        type: 'module',
        version: '0.0.0',
      })
    }
    if (argv.includes('--dump-config')) {
      return {
        status: 0,
        stderr: '',
        stdout: `- id: agent-default-model
  config:
    provider: tianwen-offline
    model: phase2-smoke
- id: session-persistence-jsonl
  config:
    root: ${paths.sessionsRoot.replaceAll('\\', '/')}
    compression: none
    packChunks: false
- id: cordis-host-runner
  name: '@deepseek-ai/dsh-cordis-host-runner'
- id: tianwen-runtime
  evolutionRoot: ${paths.evolutionRoot.replaceAll('\\', '/')}
- id: tianwen-phase2-smoke
  name: '@tianwen/runtime-bundle/smoke'
`,
      }
    }
    return { status: 0, stderr: '', stdout: '' }
  }
  return { calls, childEnvironments, executables, runner }
}

afterEach(() => {
  for (const root of testRoots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Tianwen installer contract', () => {
  it('accepts only a data directory and optional JSON output', () => {
    expect(parseInstallerArgs(['--data-dir', 'D:\\DevData\\tianwen', '--json']))
      .toEqual({ dataDir: 'D:\\DevData\\tianwen', json: true })
    expect(parseInstallerArgs(['--data-dir', 'D:\\DevData\\tianwen']))
      .toEqual({ dataDir: 'D:\\DevData\\tianwen', json: false })

    for (const argv of [
      [],
      ['--data-dir', 'D:\\DevData\\one', '--data-dir', 'D:\\DevData\\two'],
      ['--data-dir', 'D:\\DevData\\tianwen', '--profile', 'other'],
      ['--data-dir', 'D:\\DevData\\tianwen', '--package', 'evil'],
      ['--data-dir', 'D:\\DevData\\tianwen', '--executable', 'cmd.exe'],
    ]) {
      expect(() => parseInstallerArgs(argv)).toThrow()
    }
  })

  it('derives the complete fixed Windows installation surface', () => {
    const paths = deriveInstallPaths('D:\\DevData\\tianwen', 'win32')
    expect(paths).toEqual({
      archivePath: 'D:\\DevData\\tianwen\\packs\\tianwen-runtime-bundle-0.0.0.tgz',
      binDir: 'D:\\DevData\\tianwen\\dsh-home\\profiles\\tianwen\\node_modules\\.bin',
      dataDir: 'D:\\DevData\\tianwen',
      dshHome: 'D:\\DevData\\tianwen\\dsh-home',
      evolutionRoot: 'D:\\DevData\\tianwen\\state\\evolution',
      hostRoot: 'D:\\DevData\\tianwen\\dsh-host',
      profileRoot: 'D:\\DevData\\tianwen\\dsh-home\\profiles\\tianwen',
      receiptPath: 'D:\\DevData\\tianwen\\receipts\\tianwen-install.json',
      sessionsRoot: 'D:\\DevData\\tianwen\\dsh-home\\sessions',
    })
  })

  it('rejects relative, non-D-DevData and shell-sensitive Windows paths', () => {
    for (const path of [
      'relative\\tianwen',
      'C:\\DevData\\tianwen',
      'D:\\Other\\tianwen',
      'D:\\DevData\\tian wen',
      'D:\\DevData\\tianwen&whoami',
      'D:\\DevData\\tianwen;whoami',
      'D:\\DevData\\tianwen|whoami',
      'D:\\DevData\\tianwen`whoami',
      'D:\\DevData\\tianwen$env:TEMP',
    ]) {
      expect(() => deriveInstallPaths(path, 'win32')).toThrow()
    }
  })

  it('renders one deterministic path-specific Profile patch', () => {
    const paths = deriveInstallPaths('D:\\DevData\\custom-tianwen', 'win32')
    const patch = renderProfilePatch(paths)
    expect(patch).not.toContain('\r')
    expect(patch).toMatch(/\n$/u)
    expect(patch).toContain("root: 'D:/DevData/custom-tianwen/dsh-home/sessions'")
    expect(patch).toContain("evolutionRoot: 'D:/DevData/custom-tianwen/state/evolution'")
    expect(patch).toContain("name: '@deepseek-ai/dsh-cordis-host-runner'")
    expect(patch).toContain("name: '@tianwen/runtime-bundle/smoke'")
  })

  it('accepts only an exact rc.6 host with a contained executable', () => {
    const root = testRoot('host')
    const packageRoot = join(root, 'node_modules', '@deepseek-ai', 'dsh')
    mkdirSync(join(packageRoot, 'lib'), { recursive: true })
    writeFileSync(join(packageRoot, 'lib', 'bin.js'), 'export {}\n', 'utf8')
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      bin: { dsh: 'lib/bin.js' },
      version: '0.1.0-rc.6',
    }), 'utf8')

    expect(validateInstalledHost(root)).toBe(join(packageRoot, 'lib', 'bin.js'))
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      bin: { dsh: 'lib/bin.js' },
      version: '0.1.0-rc.5',
    }), 'utf8')
    expect(() => validateInstalledHost(root)).toThrow(/0\.1\.0-rc\.6/u)
  })

  it('creates stable canonical receipt bytes without environment-specific commands', () => {
    const paths = deriveInstallPaths('D:\\DevData\\tianwen', 'win32')
    const receipt = createInstallReceipt(paths, {
      archiveDigest: 'sha256:' + 'a'.repeat(64),
      cliPath: join(paths.profileRoot, 'node_modules', '@tianwen', 'runtime-bundle', 'dist', 'cli.js'),
    })
    expect(receipt).toMatchObject({
      schemaVersion: 'tianwen.install.v1',
      status: 'ready',
      dshVersion: '0.1.0-rc.6',
      pnpmVersion: '11.20.0',
      profileBundles: [
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-headless',
        '@tianwen/runtime-bundle',
      ],
    })
    const bytes = canonicalJson(receipt)
    expect(bytes).toBe(canonicalJson({ ...receipt }))
    expect(bytes.endsWith('\n')).toBe(true)
    expect(bytes).not.toContain('corepack-home')
    expect(bytes).not.toContain('commands')
  })

  it('installs and replays the fixed sequence without touching durable state', () => {
    const root = testRoot('replay')
    const paths = deriveInstallPaths(root, 'win32')
    const session = join(paths.sessionsRoot, 'kept.jsonl')
    const ledger = join(paths.evolutionRoot, 'ledger.jsonl')
    mkdirSync(paths.sessionsRoot, { recursive: true })
    mkdirSync(paths.evolutionRoot, { recursive: true })
    writeFileSync(session, '{"session":"kept"}\n', { encoding: 'utf8', flag: 'wx' })
    writeFileSync(ledger, '{"artifact":"kept"}\n', { encoding: 'utf8', flag: 'wx' })
    const before = [readFileSync(session), readFileSync(ledger)]
    const scripted = scriptedInstaller(paths)

    const first = installTianwen({ dataDir: root, runner: scripted.runner })
    const receiptBytes = readFileSync(paths.receiptPath)
    const managedBytes = [
      join(paths.hostRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
      paths.archivePath,
      join(paths.profileRoot, 'package.json'),
      join(paths.profileRoot, 'pnpm-workspace.yaml'),
      join(paths.profileRoot, 'cordis.patch.yml'),
    ].map(path => readFileSync(path))
    const replay = installTianwen({ dataDir: root, runner: scripted.runner })

    expect(replay).toEqual(first)
    expect(readFileSync(paths.receiptPath)).toEqual(receiptBytes)
    expect([
      join(paths.hostRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
      paths.archivePath,
      join(paths.profileRoot, 'package.json'),
      join(paths.profileRoot, 'pnpm-workspace.yaml'),
      join(paths.profileRoot, 'cordis.patch.yml'),
    ].map(path => readFileSync(path))).toEqual(managedBytes)
    expect([readFileSync(session), readFileSync(ledger)]).toEqual(before)
    expect(scripted.calls.filter(argv => argv.includes('deploy'))).toHaveLength(1)
    expect(scripted.calls.filter(argv => argv.includes('plugin'))).toHaveLength(2)
    expect(scripted.calls.filter(argv => argv.includes('--dump-config'))).toHaveLength(2)
    const dshBin = join(paths.hostRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    expect(scripted.calls.filter(argv => argv[0]?.endsWith('bin.js'))).toEqual([
      [
        dshBin,
        'plugin', '--profile', 'tianwen',
        'add', '--offline',
        '@deepseek-ai/dsh-base@0.1.0-rc.6',
        '@deepseek-ai/dsh-headless@0.1.0-rc.6',
        paths.archivePath,
      ],
      [dshBin, '--profile', 'tianwen', '--dump-config'],
      [
        dshBin,
        'plugin', '--profile', 'tianwen',
        'add', '--offline',
        '@deepseek-ai/dsh-base@0.1.0-rc.6',
        '@deepseek-ai/dsh-headless@0.1.0-rc.6',
        paths.archivePath,
      ],
      [dshBin, '--profile', 'tianwen', '--dump-config'],
    ])
    expect(scripted.executables.every(executable => executable === process.execPath)).toBe(true)
    expect(scripted.calls.every(argv => !argv.includes(session) && !argv.includes(ledger))).toBe(true)
  })

  it('fails closed on an incompatible managed host before any child process', () => {
    const root = testRoot('bad-host')
    const paths = deriveInstallPaths(root, 'win32')
    mkdirSync(paths.hostRoot, { recursive: true })
    mkdirSync(join(paths.receiptPath, '..'), { recursive: true })
    writeFileSync(paths.receiptPath, '{"stale":true}\n', 'utf8')
    const receiptBefore = readFileSync(paths.receiptPath)
    const scripted = scriptedInstaller(paths)

    expect(() => installTianwen({ dataDir: root, runner: scripted.runner })).toThrow()
    expect(scripted.calls).toEqual([])
    expect(readFileSync(paths.receiptPath)).toEqual(receiptBefore)
  })

  it('does not publish a receipt or alter durable state after a child failure', () => {
    const root = testRoot('child-failure')
    const paths = deriveInstallPaths(root, 'win32')
    const session = join(paths.sessionsRoot, 'kept.jsonl')
    const ledger = join(paths.evolutionRoot, 'ledger.jsonl')
    mkdirSync(paths.sessionsRoot, { recursive: true })
    mkdirSync(paths.evolutionRoot, { recursive: true })
    writeFileSync(session, 'session bytes\n', { encoding: 'utf8', flag: 'wx' })
    writeFileSync(ledger, 'ledger bytes\n', { encoding: 'utf8', flag: 'wx' })
    const scripted = scriptedInstaller(paths, 'build')

    expect(() => installTianwen({ dataDir: root, runner: scripted.runner })).toThrow(/scripted failure/u)
    expect(existsSync(paths.receiptPath)).toBe(false)
    expect(readFileSync(session, 'utf8')).toBe('session bytes\n')
    expect(readFileSync(ledger, 'utf8')).toBe('ledger bytes\n')
  })

  it('preserves the last archive and receipt when an upgrade pack fails', () => {
    const root = testRoot('failed-upgrade')
    const paths = deriveInstallPaths(root, 'win32')
    installTianwen({ dataDir: root, runner: scriptedInstaller(paths).runner })
    const archiveBefore = readFileSync(paths.archivePath)
    const receiptBefore = readFileSync(paths.receiptPath)

    expect(() => installTianwen({
      dataDir: root,
      runner: scriptedInstaller(paths, 'pack').runner,
    })).toThrow(/scripted failure/u)
    expect(readFileSync(paths.archivePath)).toEqual(archiveBefore)
    expect(readFileSync(paths.receiptPath)).toEqual(receiptBefore)
  })

  it('reuses caller-configured D-drive package stores', () => {
    const root = testRoot('configured-store')
    const paths = deriveInstallPaths(root, 'win32')
    const scripted = scriptedInstaller(paths)
    installTianwen({
      dataDir: root,
      env: {
        ...process.env,
        NPM_CONFIG_CACHE: 'D:\\DevData\\custom-npm-cache',
        PNPM_CONFIG_STORE_DIR: 'D:\\DevData\\custom-pnpm-store',
      },
      runner: scripted.runner,
    })

    expect(scripted.childEnvironments.every(env =>
      env.NPM_CONFIG_CACHE === 'D:\\DevData\\custom-npm-cache'
      && env.PNPM_CONFIG_STORE_DIR === 'D:\\DevData\\custom-pnpm-store')).toBe(true)
  })

  it.each(['pnpm-workspace.yaml', 'cordis.patch.yml']) (
    'rejects a modified managed %s before child effects and preserves the last receipt',
    (managedFile) => {
      const root = testRoot(`modified-${managedFile}`)
      const paths = deriveInstallPaths(root, 'win32')
      const initial = scriptedInstaller(paths)
      installTianwen({ dataDir: root, runner: initial.runner })
      const receiptBefore = readFileSync(paths.receiptPath)
      writeFileSync(join(paths.profileRoot, managedFile), 'user-modified\n', 'utf8')
      const rejected = scriptedInstaller(paths)

      expect(() => installTianwen({ dataDir: root, runner: rejected.runner }))
        .toThrow(/differs from Tianwen v1/u)
      expect(rejected.calls).toEqual([])
      expect(readFileSync(paths.receiptPath)).toEqual(receiptBefore)
    },
  )
})
