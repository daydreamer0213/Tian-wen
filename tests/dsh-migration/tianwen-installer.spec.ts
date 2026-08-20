import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalJson,
  createInstallReceipt,
  deriveInstallPaths,
  installTianwen,
  parseInstallerArgs,
  renderProfilePatch,
  validateDump,
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

function scriptedInstaller(
  paths: ReturnType<typeof deriveInstallPaths>,
  failOn?: string,
  archiveBytes: string | readonly string[] = 'fixed runtime archive\n',
  dumpOptions: { foldedSessionsRoot?: boolean, sessionsRoot?: string } = {},
) {
  const calls: string[][] = []
  const childEnvironments: NodeJS.ProcessEnv[] = []
  const executables: string[] = []
  const spawnOptions: { shell: boolean, timeout: number }[] = []
  let packOrdinal = 0
  const runner = (executable: string, argv: string[], options: {
    env: NodeJS.ProcessEnv
    shell: boolean
    timeout: number
  }) => {
    expect(options.shell).toBe(false)
    childEnvironments.push(options.env)
    executables.push(executable)
    calls.push([...argv])
    const failed = failOn !== undefined && argv.includes(failOn)
    spawnOptions.push({ shell: options.shell, timeout: options.timeout })
    if (argv[1] === '--version') return { status: 0, stderr: '', stdout: '11.20.0\n' }
    if (argv.includes('deploy') && argv.includes('@tianwen/dsh-host')) {
      const destination = argv.at(-1)!
      const packageRoot = join(destination, 'node_modules', '@deepseek-ai', 'dsh')
      mkdirSync(join(packageRoot, 'lib'), { recursive: true })
      if (failed) {
        writeFileSync(join(packageRoot, 'partial-deploy'), 'partial\n', 'utf8')
        return { status: 12, stderr: 'scripted failure', stdout: '' }
      }
      writeFileSync(join(packageRoot, 'lib', 'bin.js'), 'export {}\n', 'utf8')
      writeJson(join(packageRoot, 'package.json'), {
        bin: { dsh: 'lib/bin.js' },
        version: '0.1.0-rc.7',
      })
    }
    if (argv.includes('pack')) {
      const destination = argv.at(argv.indexOf('--pack-destination') + 1)
      const bytes = typeof archiveBytes === 'string' ? archiveBytes : archiveBytes[packOrdinal]
      packOrdinal += 1
      expect(destination).toBeTypeOf('string')
      expect(bytes).toBeTypeOf('string')
      mkdirSync(destination!, { recursive: true })
      writeFileSync(join(destination!, 'tianwen-runtime-bundle-0.0.0.tgz'), bytes!, 'utf8')
    }
    if (argv.includes('deploy') && argv.includes('@tianwen/profile-host')) {
      const destination = argv.at(-1)!
      writeJson(join(destination, 'package.json'), {
        dependencies: {
          '@deepseek-ai/dsh-base': '0.1.0-rc.7',
          '@deepseek-ai/dsh-headless': '0.1.0-rc.7',
          '@tianwen/runtime-bundle': '0.0.0',
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
      const runtimeRoot = join(destination, 'node_modules', '@tianwen', 'runtime-bundle')
      mkdirSync(join(runtimeRoot, 'dist'), { recursive: true })
      writeFileSync(join(runtimeRoot, 'dist', 'runtime.js'), 'export default {}\n', 'utf8')
      writeFileSync(join(runtimeRoot, 'dist', 'cli.js'), 'export {}\n', 'utf8')
      const binDir = join(destination, 'node_modules', '.bin')
      mkdirSync(binDir, { recursive: true })
      writeFileSync(join(binDir, 'tianwen.CMD'), '@echo off\r\n', 'utf8')
      writeJson(join(runtimeRoot, 'package.json'), {
        bin: { tianwen: 'dist/cli.js' },
        exports: { './runtime': './dist/runtime.js' },
        name: '@tianwen/runtime-bundle',
        type: 'module',
        version: '0.0.0',
      })
    }
    if (failed) return { status: 12, stderr: 'scripted failure', stdout: '' }
    if (argv.includes('--dump-config')) {
      const sessionsRoot = dumpOptions.sessionsRoot ?? paths.sessionsRoot
      const renderedSessionsRoot = sessionsRoot.replaceAll('\\', '/')
      return {
        status: 0,
        stderr: '',
        stdout: `- id: agent-default-model
  config:
    provider: tianwen-offline
    model: phase2-smoke
- id: session-persistence-jsonl
  config:
    root: ${dumpOptions.foldedSessionsRoot ? `>-\n      ${renderedSessionsRoot}` : renderedSessionsRoot}
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
  return { calls, childEnvironments, executables, spawnOptions, runner }
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
    expect(patch).toContain('- id: attachment-local\n  disabled: true')
    expect(patch).toContain('- id: sandbox\n  disabled: true')
    expect(patch).toContain('- id: pwsh-sandbox\n  disabled: true')
    expect(patch).toContain('- id: permission\n  disabled: true')
    expect(patch).toContain('- id: tool-pwsh\n  disabled: true')
    expect(patch).toContain("name: '@deepseek-ai/dsh-cordis-host-runner'")
    expect(patch).toContain("name: '@tianwen/runtime-bundle/smoke'")
  })

  it('accepts only an exact rc.7 host with a contained executable', () => {
    const root = testRoot('host')
    const packageRoot = join(root, 'node_modules', '@deepseek-ai', 'dsh')
    mkdirSync(join(packageRoot, 'lib'), { recursive: true })
    writeFileSync(join(packageRoot, 'lib', 'bin.js'), 'export {}\n', 'utf8')
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      bin: { dsh: 'lib/bin.js' },
      version: '0.1.0-rc.7',
    }), 'utf8')

    expect(validateInstalledHost(root)).toBe(join(packageRoot, 'lib', 'bin.js'))
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      bin: { dsh: 'lib/bin.js' },
      version: '0.1.0-rc.5',
    }), 'utf8')
    expect(() => validateInstalledHost(root)).toThrow(/0\.1\.0-rc\.7/u)
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
      dshVersion: '0.1.0-rc.7',
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
    expect(scripted.calls.filter(argv => argv.includes('deploy'))).toHaveLength(2)
    const packCalls = scripted.calls.filter(argv => argv.includes('pack'))
    expect(packCalls.map(argv =>
      argv.filter(value => value === '--skip-manifest-obfuscation').length)).toEqual([1, 1, 1, 1])
    expect(new Set(packCalls.map(argv =>
      argv.at(argv.indexOf('--pack-destination') + 1))).size).toBe(4)
    expect(scripted.calls.filter(argv => argv.includes('build') || argv.includes('pack')).map(argv =>
      argv.includes('build') ? 'build' : 'pack')).toEqual([
      'build', 'pack', 'build', 'pack', 'build', 'pack', 'build', 'pack',
    ])
    expect(scripted.calls.filter(argv => argv.includes('plugin'))).toHaveLength(0)
    expect(scripted.calls.filter(argv => argv.includes('--dump-config'))).toHaveLength(2)
    const dshBin = join(paths.hostRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    expect(scripted.calls.filter(argv => argv[0]?.endsWith('bin.js'))).toEqual([
      [dshBin, '--profile', 'tianwen', '--dump-config'],
      [dshBin, '--profile', 'tianwen', '--dump-config'],
    ])
    expect(scripted.executables.every(executable => executable === process.execPath)).toBe(true)
    expect(scripted.spawnOptions.every(options => options.shell === false)).toBe(true)
    expect(scripted.spawnOptions[scripted.calls.findIndex(argv =>
      argv.includes('deploy') && argv.includes('@tianwen/dsh-host'))]?.timeout).toBe(900_000)
    expect(scripted.spawnOptions[scripted.calls.findIndex(argv =>
      argv.includes('deploy') && argv.includes('@tianwen/profile-host'))]?.timeout).toBe(900_000)
    expect(scripted.calls.every(argv => !argv.includes(session) && !argv.includes(ledger))).toBe(true)
  })

  it('accepts a folded DSH sessions root and rejects a different folded root', () => {
    const root = testRoot('long-folded-root')
    const paths = deriveInstallPaths(root, 'win32')
    const accepted = scriptedInstaller(paths, undefined, undefined, { foldedSessionsRoot: true })

    installTianwen({ dataDir: root, runner: accepted.runner })

    expect(() => installTianwen({
      dataDir: root,
      runner: scriptedInstaller(paths, undefined, undefined, {
        foldedSessionsRoot: true,
        sessionsRoot: `${paths.sessionsRoot}\\unexpected`,
      }).runner,
    })).toThrow(/session-persistence-jsonl\.root differs from Tianwen v1/u)
  })

  it('validates DSH\'s exact folded long sessions root and rejects a different value', () => {
    const paths = deriveInstallPaths(
      'D:\\DevData\\tianwen-live-goal-round\\test-data\\installed-e2e',
      'win32',
    )
    const dump = `- id: agent-default-model
  config:
    provider: tianwen-offline
    model: phase2-smoke
- id: session-persistence-jsonl
  config:
    root: >-
      D:/DevData/tianwen-live-goal-round/test-data/installed-e2e/dsh-home/sessions
    compression: none
    packChunks: false
- id: cordis-host-runner
  name: '@deepseek-ai/dsh-cordis-host-runner'
- id: tianwen-runtime
  evolutionRoot: D:/DevData/tianwen-live-goal-round/test-data/installed-e2e/state/evolution
- id: tianwen-phase2-smoke
  name: '@tianwen/runtime-bundle/smoke'
`

    expect(() => validateDump(dump, paths)).not.toThrow()
    expect(() => validateDump(
      dump.replace('/sessions\n', '/sessions-unexpected\n'),
      paths,
    )).toThrow(/session-persistence-jsonl\.root differs from Tianwen v1/u)
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

  it('removes a partial first host deploy without touching durable state', () => {
    const root = testRoot('failed-host-deploy')
    const paths = deriveInstallPaths(root, 'win32')
    const session = join(paths.sessionsRoot, 'kept.jsonl')
    const ledger = join(paths.evolutionRoot, 'ledger.jsonl')
    mkdirSync(paths.sessionsRoot, { recursive: true })
    mkdirSync(paths.evolutionRoot, { recursive: true })
    writeFileSync(session, 'session bytes\n', { encoding: 'utf8', flag: 'wx' })
    writeFileSync(ledger, 'ledger bytes\n', { encoding: 'utf8', flag: 'wx' })

    expect(() => installTianwen({
      dataDir: root,
      runner: scriptedInstaller(paths, '@tianwen/dsh-host').runner,
    })).toThrow(/scripted failure/u)
    expect(existsSync(paths.hostRoot)).toBe(false)
    expect(existsSync(paths.profileRoot)).toBe(false)
    expect(existsSync(paths.archivePath)).toBe(false)
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

  it('rejects consecutive Runtime archives that differ before changing published state', () => {
    const root = testRoot('unstable-runtime-archive')
    const paths = deriveInstallPaths(root, 'win32')
    const session = join(paths.sessionsRoot, 'kept.jsonl')
    const ledger = join(paths.evolutionRoot, 'ledger.jsonl')
    mkdirSync(paths.sessionsRoot, { recursive: true })
    mkdirSync(paths.evolutionRoot, { recursive: true })
    writeFileSync(session, 'session bytes\n', 'utf8')
    writeFileSync(ledger, 'ledger bytes\n', 'utf8')
    installTianwen({
      dataDir: root,
      runner: scriptedInstaller(paths, undefined, 'published runtime\n').runner,
    })
    const publishedPaths = [
      join(paths.hostRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
      join(paths.profileRoot, 'package.json'),
      join(paths.profileRoot, 'pnpm-workspace.yaml'),
      join(paths.profileRoot, 'cordis.patch.yml'),
      paths.archivePath,
      paths.receiptPath,
      session,
      ledger,
    ]
    const publishedBefore = publishedPaths.map(path => readFileSync(path))
    const unstable = scriptedInstaller(paths, undefined, [
      'unstable runtime one\n',
      'unstable runtime two\n',
    ])

    expect(() => installTianwen({ dataDir: root, runner: unstable.runner }))
      .toThrow('Runtime Bundle archive is not stable across consecutive builds')
    expect(unstable.calls.filter(argv => argv.includes('build') || argv.includes('pack')).map(argv =>
      argv.includes('build') ? 'build' : 'pack')).toEqual(['build', 'pack', 'build', 'pack'])
    expect(unstable.calls.filter(argv => argv.includes('pack')).map(argv =>
      argv.filter(value => value === '--skip-manifest-obfuscation').length)).toEqual([1, 1])
    expect(unstable.calls.filter(argv => argv.includes('@tianwen/profile-host'))).toHaveLength(0)
    expect(unstable.calls.filter(argv => argv.includes('--dump-config'))).toHaveLength(0)
    expect(publishedPaths.map(path => readFileSync(path))).toEqual(publishedBefore)
    expect(readdirSync(dirname(paths.archivePath)).filter(name => name.startsWith('.install-')))
      .toEqual([])
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
        PNPM_CONFIG_CACHE_DIR: 'D:\\DevData\\custom-npm-cache',
        PNPM_CONFIG_STORE_DIR: 'D:\\DevData\\custom-pnpm-store',
      },
      runner: scripted.runner,
    })

    expect(scripted.childEnvironments.every(env =>
      env.NPM_CONFIG_CACHE === 'D:\\DevData\\custom-npm-cache'
      && env.PNPM_CONFIG_CACHE_DIR === 'D:\\DevData\\custom-npm-cache'
      && env.PNPM_CONFIG_MINIMUM_RELEASE_AGE === undefined
      && env.PNPM_CONFIG_STORE_DIR === 'D:\\DevData\\custom-pnpm-store')).toBe(true)
  })

  it('reinstalls the fixed Profile when the Runtime archive changes', () => {
    const root = testRoot('upgrade')
    const paths = deriveInstallPaths(root, 'win32')
    const first = scriptedInstaller(paths, undefined, 'runtime v1\n')
    const receiptV1 = installTianwen({ dataDir: root, runner: first.runner })
    const second = scriptedInstaller(paths, undefined, 'runtime v2\n')
    const receiptV2 = installTianwen({ dataDir: root, runner: second.runner })

    expect(receiptV2.archiveDigest).not.toBe(receiptV1.archiveDigest)
    expect(second.calls.filter(argv => argv.includes('@tianwen/profile-host'))).toHaveLength(1)
    expect(second.calls.filter(argv => argv.includes('plugin'))).toHaveLength(0)
  })

  it('keeps the previous Profile and receipt when a Profile upgrade fails', () => {
    const root = testRoot('failed-profile-upgrade')
    const paths = deriveInstallPaths(root, 'win32')
    installTianwen({ dataDir: root, runner: scriptedInstaller(paths, undefined, 'runtime v1\n').runner })
    const archiveBefore = readFileSync(paths.archivePath)
    const profileBefore = readFileSync(join(paths.profileRoot, 'package.json'))
    const receiptBefore = readFileSync(paths.receiptPath)

    expect(() => installTianwen({
      dataDir: root,
      runner: scriptedInstaller(paths, '@tianwen/profile-host', 'runtime v2\n').runner,
    })).toThrow(/scripted failure/u)
    expect(readFileSync(paths.archivePath)).toEqual(archiveBefore)
    expect(readFileSync(join(paths.profileRoot, 'package.json'))).toEqual(profileBefore)
    expect(readFileSync(paths.receiptPath)).toEqual(receiptBefore)
  })

  it('restores the previous Profile when post-deploy validation fails', () => {
    const root = testRoot('failed-profile-validation')
    const paths = deriveInstallPaths(root, 'win32')
    const session = join(paths.sessionsRoot, 'kept.jsonl')
    const ledger = join(paths.evolutionRoot, 'ledger.jsonl')
    mkdirSync(paths.sessionsRoot, { recursive: true })
    mkdirSync(paths.evolutionRoot, { recursive: true })
    writeFileSync(session, 'session bytes\n', 'utf8')
    writeFileSync(ledger, 'ledger bytes\n', 'utf8')
    installTianwen({ dataDir: root, runner: scriptedInstaller(paths, undefined, 'runtime v1\n').runner })
    const archiveBefore = readFileSync(paths.archivePath)
    const profileBefore = readFileSync(join(paths.profileRoot, 'package.json'))
    const receiptBefore = readFileSync(paths.receiptPath)

    expect(() => installTianwen({
      dataDir: root,
      runner: scriptedInstaller(paths, '--dump-config', 'runtime v2\n').runner,
    })).toThrow(/scripted failure/u)
    expect(readFileSync(paths.archivePath)).toEqual(archiveBefore)
    expect(readFileSync(join(paths.profileRoot, 'package.json'))).toEqual(profileBefore)
    expect(readFileSync(paths.receiptPath)).toEqual(receiptBefore)
    expect(readFileSync(session, 'utf8')).toBe('session bytes\n')
    expect(readFileSync(ledger, 'utf8')).toBe('ledger bytes\n')
  })

  it('removes a first-install Profile when post-deploy validation fails', () => {
    const root = testRoot('failed-first-profile-validation')
    const paths = deriveInstallPaths(root, 'win32')

    expect(() => installTianwen({
      dataDir: root,
      runner: scriptedInstaller(paths, '--dump-config').runner,
    })).toThrow(/scripted failure/u)
    expect(existsSync(paths.archivePath)).toBe(false)
    expect(existsSync(paths.profileRoot)).toBe(false)
    expect(existsSync(paths.receiptPath)).toBe(false)
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
