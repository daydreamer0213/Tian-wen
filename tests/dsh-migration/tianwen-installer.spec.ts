import { spawnSync } from 'node:child_process'
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalJson,
  classifyManagedInstallation,
  createInstallerFailureReceipt,
  createInstallReceipt,
  deriveInstallPaths,
  installTianwen,
  parseInstallerArgs,
  renderProfilePatch,
  validateDump,
  validateInstalledHost,
} from '../../scripts/install-tianwen.mjs'

const testRoots: string[] = []
const CURRENT_DSH_VERSION = '0.1.1-rc.2'
const PREDECESSOR_DSH_VERSION = '0.1.0-rc.7'
const RUNTIME_FILES = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/runtime.js',
  'dist/smoke.js',
  'dist/status.js',
  'dist/status.d.ts',
  'dist/cli.js',
  'dist/model-runner.js',
  'dist/create-runner.js',
  'dist/goal-first-runner.js',
  'dist/resume-runner.js',
  'dist/controlled-lifecycle-runner.js',
  'cordis.patch.yml',
  'create.patch.yml',
  'goal-first.patch.yml',
  'model.patch.yml',
  'resume.patch.yml',
  'controlled-lifecycle.patch.yml',
] as const
const RUNTIME_DEPLOYED_PUBLICATION = [...RUNTIME_FILES, 'package.json'] as const
const RUNTIME_PUBLICATION = [...RUNTIME_FILES, 'package.json', 'LICENSE'] as const

function historicalOriginalProfilePatchFixture(paths: ReturnType<typeof deriveInstallPaths>): string {
  return `- id: agent-default-model
  config:
    provider: tianwen-offline
    model: phase2-smoke

- id: session-persistence-jsonl
  config:
    root: '${paths.sessionsRoot.replaceAll('\\', '/')}'
    compression: none
    packChunks: false

- id: tianwen-runtime
  config:
    evolutionRoot: '${paths.evolutionRoot.replaceAll('\\', '/')}'

- insert:
    - id: cordis-host-runner
      name: '@deepseek-ai/dsh-cordis-host-runner'

    - id: tianwen-phase2-smoke
      name: '@tianwen/runtime-bundle/smoke'
`
}

function historicalLockedProfilePatchFixture(paths: ReturnType<typeof deriveInstallPaths>): string {
  return `- id: agent-default-model
  config:
    provider: tianwen-offline
    model: phase2-smoke

- id: session-persistence-jsonl
  config:
    root: '${paths.sessionsRoot.replaceAll('\\', '/')}'
    compression: none
    packChunks: false

- id: tianwen-runtime
  config:
    evolutionRoot: '${paths.evolutionRoot.replaceAll('\\', '/')}'

- id: attachment-local
  disabled: true

- id: sandbox
  disabled: true

- id: pwsh-sandbox
  disabled: true

- id: permission
  disabled: true

- id: tool-pwsh
  disabled: true

- insert:
    - id: cordis-host-runner
      name: '@deepseek-ai/dsh-cordis-host-runner'

    - id: tianwen-phase2-smoke
      name: '@tianwen/runtime-bundle/smoke'
`
}

function testRoot(name: string): string {
  const root = `D:\\DevData\\tianwen-installer-tests\\${name}-${crypto.randomUUID()}`
  testRoots.push(root)
  return root
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`, 'utf8')
}

function writeRuntimePublication(runtimeRoot: string, label = 'runtime'): void {
  for (const path of RUNTIME_FILES) {
    mkdirSync(dirname(join(runtimeRoot, path)), { recursive: true })
    writeFileSync(join(runtimeRoot, path), `${label}:${path}\n`, 'utf8')
  }
  writeJson(join(runtimeRoot, 'package.json'), {
    bin: { tianwen: 'dist/cli.js' },
    exports: {
      './runtime': './dist/runtime.js',
      './controlled-lifecycle-runner': './dist/controlled-lifecycle-runner.js',
    },
    files: [...RUNTIME_FILES],
    name: '@tianwen/runtime-bundle',
    type: 'module',
    version: '0.1.10',
  })
}

function writeRuntimeRepository(repoRoot: string, label = 'runtime'): void {
  writeRuntimePublication(join(repoRoot, 'packages', 'tianwen-runtime-bundle'), label)
  writeFileSync(join(repoRoot, 'LICENSE'), `${label}:license\n`, 'utf8')
}

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const entries: Record<string, string> = {}
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const label = path.slice(root.length + 1).replaceAll('\\', '/')
      if (entry.isDirectory()) {
        entries[`directory:${label}`] = ''
        visit(path)
      } else if (entry.isFile()) {
        entries[`file:${label}`] = readFileSync(path).toString('base64')
      }
    }
  }
  if (existsSync(root)) visit(root)
  return entries
}

function failureReceipt(operation: () => unknown) {
  try {
    operation()
  } catch (error) {
    return createInstallerFailureReceipt(error)
  }
  throw new Error('expected installer failure')
}

function installWindowsFixture(options: NonNullable<Parameters<typeof installTianwen>[0]>) {
  const repoRoot = options.repoRoot ?? testRoot('installer-repo')
  if (options.repoRoot === undefined) {
    writeRuntimeRepository(repoRoot, 'fixture-source')
  }
  return installTianwen({ ...options, platform: 'win32', repoRoot })
}

function scriptedFailure(
  name: string,
  failOn?: string,
  archiveBytes?: string | readonly string[],
) {
  const paths = deriveInstallPaths(testRoot(name), 'win32')
  const scripted = scriptedInstaller(paths, failOn, archiveBytes)
  return () => installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })
}

function writeManagedPredecessor(
  paths: ReturnType<typeof deriveInstallPaths>,
  encoding: 'original-archive' | 'locked-deploy',
): void {
  installWindowsFixture({ dataDir: paths.dataDir, runner: scriptedInstaller(paths).runner })
  const predecessorArchivePath = paths.archivePath.replace(
    'tianwen-runtime-bundle-0.1.10.tgz',
    'tianwen-runtime-bundle-0.0.0.tgz',
  )
  renameSync(paths.archivePath, predecessorArchivePath)
  const hostManifest = join(paths.hostRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  writeJson(hostManifest, { bin: { dsh: 'lib/bin.js' }, version: PREDECESSOR_DSH_VERSION })
  writeJson(join(paths.profileRoot, 'package.json'), {
    dependencies: {
      '@deepseek-ai/dsh-base': PREDECESSOR_DSH_VERSION,
      '@deepseek-ai/dsh-headless': PREDECESSOR_DSH_VERSION,
      '@tianwen/runtime-bundle': encoding === 'original-archive'
        ? `file:${predecessorArchivePath.replaceAll('\\', '/')}`
        : '0.0.0',
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
  writeFileSync(join(paths.profileRoot, 'cordis.patch.yml'),
    encoding === 'original-archive'
      ? historicalOriginalProfilePatchFixture(paths)
      : historicalLockedProfilePatchFixture(paths),
    'utf8')
  const receipt = JSON.parse(readFileSync(paths.receiptPath, 'utf8'))
  receipt.dshVersion = PREDECESSOR_DSH_VERSION
  receipt.archivePath = predecessorArchivePath
  writeJson(paths.receiptPath, receipt)
}

function runtimePredecessorArchivePath(paths: ReturnType<typeof deriveInstallPaths>): string {
  return paths.archivePath.replace(
    'tianwen-runtime-bundle-0.1.10.tgz',
    'tianwen-runtime-bundle-0.1.9.tgz',
  )
}

function writeManagedRuntimePredecessor(paths: ReturnType<typeof deriveInstallPaths>): void {
  installWindowsFixture({ dataDir: paths.dataDir, runner: scriptedInstaller(paths).runner })
  const archivePath = runtimePredecessorArchivePath(paths)
  renameSync(paths.archivePath, archivePath)
  const profileManifestPath = join(paths.profileRoot, 'package.json')
  const profile = JSON.parse(readFileSync(profileManifestPath, 'utf8'))
  profile.dependencies['@tianwen/runtime-bundle'] = '0.1.9'
  writeJson(profileManifestPath, profile)
  const runtimeManifestPath = join(
    paths.profileRoot,
    'node_modules',
    '@tianwen',
    'runtime-bundle',
    'package.json',
  )
  const runtime = JSON.parse(readFileSync(runtimeManifestPath, 'utf8'))
  runtime.version = '0.1.9'
  writeJson(runtimeManifestPath, runtime)
  const receipt = JSON.parse(readFileSync(paths.receiptPath, 'utf8'))
  receipt.archivePath = archivePath
  writeJson(paths.receiptPath, receipt)
}

function scriptedInstaller(
  paths: ReturnType<typeof deriveInstallPaths>,
  failOn?: string,
  archiveBytes: string | readonly string[] = 'fixed runtime archive\n',
  dumpOptions: { foldedSessionsRoot?: boolean, sessionsRoot?: string } = {},
  fixtureOptions: {
    onBuild?: (ordinal: number) => void
    runtimeSourceRoot?: string
  } = {},
) {
  const calls: string[][] = []
  const childEnvironments: NodeJS.ProcessEnv[] = []
  const executables: string[] = []
  const spawnOptions: { shell: boolean, timeout: number }[] = []
  const packedArchives: string[] = []
  let buildOrdinal = 0
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
    const currentBuildOrdinal = argv.includes('build') ? buildOrdinal++ : undefined
    const stageFailure = (failOn === 'runtime-bundle-build-1' && currentBuildOrdinal === 0)
      || (failOn === 'runtime-bundle-build-2' && currentBuildOrdinal === 1)
      || (failOn === 'runtime-bundle-pack-1' && argv.includes('pack') && packOrdinal === 0)
      || (failOn === 'runtime-bundle-pack-2' && argv.includes('pack') && packOrdinal === 1)
    const failed = (failOn !== undefined && argv.includes(failOn)) || stageFailure
    spawnOptions.push({ shell: options.shell, timeout: options.timeout })
    if (argv[1] === '--version') {
      return failed
        ? { status: 12, stderr: 'scripted failure', stdout: '' }
        : { status: 0, stderr: '', stdout: '11.20.0\n' }
    }
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
        version: CURRENT_DSH_VERSION,
      })
    }
    if (currentBuildOrdinal !== undefined) fixtureOptions.onBuild?.(currentBuildOrdinal)
    if (argv.includes('pack')) {
      const destination = argv.at(argv.indexOf('--pack-destination') + 1)
      const bytes = typeof archiveBytes === 'string' ? archiveBytes : archiveBytes[packOrdinal]
      packOrdinal += 1
      expect(destination).toBeTypeOf('string')
      expect(bytes).toBeTypeOf('string')
      mkdirSync(destination!, { recursive: true })
      const archive = join(destination!, 'tianwen-runtime-bundle-0.1.10.tgz')
      packedArchives.push(archive)
      writeFileSync(archive, bytes!, 'utf8')
    }
    if (argv.includes('deploy') && argv.includes('@tianwen/profile-host')) {
      const destination = argv.at(-1)!
      writeJson(join(destination, 'package.json'), {
        dependencies: {
          '@deepseek-ai/dsh-base': CURRENT_DSH_VERSION,
          '@deepseek-ai/dsh-headless': CURRENT_DSH_VERSION,
          '@tianwen/runtime-bundle': '0.1.10',
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
      if (fixtureOptions.runtimeSourceRoot === undefined) {
        writeRuntimePublication(runtimeRoot, 'installed')
      } else {
        for (const path of RUNTIME_DEPLOYED_PUBLICATION) {
          const installed = join(runtimeRoot, path)
          mkdirSync(dirname(installed), { recursive: true })
          linkSync(join(fixtureOptions.runtimeSourceRoot, path), installed)
        }
      }
      const binDir = join(destination, 'node_modules', '.bin')
      mkdirSync(binDir, { recursive: true })
      if (failOn !== 'managed-profile-validation') {
        writeFileSync(join(binDir, 'tianwen.CMD'), '@echo off\r\n', 'utf8')
      }
    }
    if (failed) return { status: 12, stderr: 'scripted failure', stdout: '' }
    if (argv.includes('--dump-config')) {
      if (failOn === 'archive-publication') rmSync(packedArchives[0]!, { force: true })
      if (failOn === 'receipt-publication') mkdirSync(paths.receiptPath)
      if (failOn === 'dsh-config-validation') {
        return { status: 0, stderr: '', stdout: 'invalid dump\n' }
      }
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
  stateRoot: ${paths.stateRoot.replaceAll('\\', '/')}
  sessionsRoot: ${paths.sessionsRoot.replaceAll('\\', '/')}
  learningLoop:
    enabled: true
    workspaceRoot: ${paths.learningLoopRoot.replaceAll('\\', '/')}
- id: tianwen-web-bridge
  name: '@tianwen/runtime-bundle'
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
  it('emits only a stage-only safe receipt for a JSON parser failure', () => {
    const installer = resolve('scripts', 'install-tianwen.mjs')
    const secret = 'credential-sentinel-do-not-emit'
    const json = spawnSync(process.execPath, [
      installer,
      '--json',
      '--data-dir', 'D:\\DevData\\tianwen',
      `--${secret}`,
    ], { encoding: 'utf8' })
    const plain = spawnSync(process.execPath, [
      installer,
      '--data-dir', 'D:\\DevData\\tianwen',
      `--${secret}`,
    ], { encoding: 'utf8' })

    expect(json.status).toBe(1)
    expect(json.stdout).toBe(canonicalJson({
      schemaVersion: 'tianwen.install-failure.v1',
      status: 'failed',
      stage: 'managed-layout-preflight',
    }))
    expect(json.stderr).toBe('')
    expect(plain.status).toBe(1)
    expect(plain.stdout).toBe('')
    expect(plain.stderr).toBe('Tianwen installer failed at managed-layout-preflight.\n')
    expect(`${json.stdout}${json.stderr}${plain.stdout}${plain.stderr}`).not.toContain(secret)
  })

  it('uses node run transport for a machine-readable installer receipt', () => {
    const root = testRoot('pnpm-machine-receipt')
    const secret = 'credential-sentinel-do-not-emit'

    expect(existsSync(root)).toBe(false)
    const result = spawnSync(process.execPath, [
      '--run',
      'install:tianwen',
      '--',
      '--data-dir', root,
      '--json',
      `--${secret}`,
    ], {
      cwd: resolve('.'),
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(() => JSON.parse(result.stdout)).not.toThrow()
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 'tianwen.install-failure.v1',
      status: 'failed',
      stage: 'managed-layout-preflight',
    })
    expect(result.stderr).toBe('')
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret)
    expect(existsSync(root)).toBe(false)
  })

  it('maps every remaining installer boundary to a closed safe stage', () => {
    const secret = 'credential-sentinel-do-not-emit'
    const missingEntryRoot = testRoot('missing-pnpm-entry')
    const missingEntryPaths = deriveInstallPaths(missingEntryRoot, 'win32')
    const missingEntry = scriptedInstaller(missingEntryPaths)
    const observed = [
      failureReceipt(() => installWindowsFixture({
        dataDir: missingEntryRoot,
        env: { ...process.env, npm_execpath: join(missingEntryRoot, 'pnpm.js') },
        runner: missingEntry.runner,
      })),
      failureReceipt(scriptedFailure('pnpm-version', '--version')),
      failureReceipt(scriptedFailure('workspace-install', 'install')),
      failureReceipt(scriptedFailure('host-deploy', '@tianwen/dsh-host')),
      failureReceipt(scriptedFailure('build-one', 'runtime-bundle-build-1')),
      failureReceipt(scriptedFailure('pack-one', 'runtime-bundle-pack-1')),
      failureReceipt(scriptedFailure('build-two', 'runtime-bundle-build-2')),
      failureReceipt(scriptedFailure('pack-two', 'runtime-bundle-pack-2')),
      failureReceipt(scriptedFailure('archive-stability', undefined, ['archive one\n', 'archive two\n'])),
      failureReceipt(scriptedFailure('profile-deploy', '@tianwen/profile-host')),
      failureReceipt(scriptedFailure('profile-validation', 'managed-profile-validation')),
      failureReceipt(scriptedFailure('dsh-config', 'dsh-config-validation')),
      failureReceipt(scriptedFailure('archive-publication', 'archive-publication')),
      failureReceipt(scriptedFailure('receipt-publication', 'receipt-publication')),
      createInstallerFailureReceipt(new Error(secret)),
    ]
    const expectedStages = [
      'pnpm-entry-preflight', 'pnpm-version', 'workspace-install',
      'managed-host-deploy', 'runtime-bundle-build-1', 'runtime-bundle-pack-1',
      'runtime-bundle-build-2', 'runtime-bundle-pack-2', 'archive-stability',
      'managed-profile-deploy', 'managed-profile-validation',
      'dsh-config-validation', 'archive-publication', 'receipt-publication',
      'installer-internal',
    ]

    expect(observed).toEqual(expectedStages.map(stage => ({
      schemaVersion: 'tianwen.install-failure.v1',
      status: 'failed',
      stage,
    })))
    expect(JSON.stringify(observed)).not.toContain(secret)
  })

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
      archivePath: 'D:\\DevData\\tianwen\\packs\\tianwen-runtime-bundle-0.1.10.tgz',
      binDir: 'D:\\DevData\\tianwen\\dsh-home\\profiles\\tianwen\\node_modules\\.bin',
      dataDir: 'D:\\DevData\\tianwen',
      dshHome: 'D:\\DevData\\tianwen\\dsh-home',
      evolutionRoot: 'D:\\DevData\\tianwen\\state\\evolution',
      learningLoopRoot: 'D:\\DevData\\tianwen\\state\\learning-loop',
      stateRoot: 'D:\\DevData\\tianwen\\state',
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
    expect(patch).toContain("workspaceRoot: 'D:/DevData/custom-tianwen/state/learning-loop'")
    expect(patch).toContain('learningLoop:\n      enabled: true')
    expect(patch).toContain("stateRoot: 'D:/DevData/custom-tianwen/state'")
    expect(patch).toContain("sessionsRoot: 'D:/DevData/custom-tianwen/dsh-home/sessions'")
    expect(patch).toContain('- id: attachment-local\n  disabled: true')
    expect(patch).toContain('- id: sandbox\n  disabled: true')
    expect(patch).toContain('- id: pwsh-sandbox\n  disabled: true')
    expect(patch).toContain('- id: permission\n  disabled: true')
    expect(patch).toContain('- id: tool-pwsh\n  disabled: true')
    expect(patch).toContain("name: '@deepseek-ai/dsh-cordis-host-runner'")
    expect(patch).not.toContain('id: tianwen-web-bridge')
    expect(patch.match(/name: '@tianwen\/runtime-bundle'/gu) ?? []).toHaveLength(0)
    expect(patch).toContain("name: '@tianwen/runtime-bundle/smoke'")
  })

  it('accepts only an exact current host with a contained executable', () => {
    const root = testRoot('host')
    const packageRoot = join(root, 'node_modules', '@deepseek-ai', 'dsh')
    mkdirSync(join(packageRoot, 'lib'), { recursive: true })
    writeFileSync(join(packageRoot, 'lib', 'bin.js'), 'export {}\n', 'utf8')
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      bin: { dsh: 'lib/bin.js' },
      version: CURRENT_DSH_VERSION,
    }), 'utf8')

    expect(validateInstalledHost(root)).toBe(join(packageRoot, 'lib', 'bin.js'))
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      bin: { dsh: 'lib/bin.js' },
      version: '0.1.0-rc.5',
    }), 'utf8')
    expect(() => validateInstalledHost(root)).toThrow(CURRENT_DSH_VERSION)
  })

  it('recognizes only the two complete managed predecessors before child effects', () => {
    const originalPaths = deriveInstallPaths(testRoot('original-predecessor'), 'win32')
    const lockedPaths = deriveInstallPaths(testRoot('locked-predecessor'), 'win32')
    writeManagedPredecessor(originalPaths, 'original-archive')
    writeManagedPredecessor(lockedPaths, 'locked-deploy')

    expect(classifyManagedInstallation(originalPaths)).toBe('managed-predecessor')
    expect(classifyManagedInstallation(lockedPaths)).toBe('managed-predecessor')

    const incompatible = [
      (() => {
        const paths = deriveInstallPaths(testRoot('rc5'), 'win32')
        writeManagedPredecessor(paths, 'original-archive')
        writeJson(join(paths.hostRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), {
          bin: { dsh: 'lib/bin.js' }, version: '0.1.0-rc.5',
        })
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('partial'), 'win32')
        mkdirSync(paths.dataDir, { recursive: true })
        writeFileSync(join(paths.dataDir, 'user-sentinel'), 'unchanged\n', 'utf8')
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('mixed'), 'win32')
        writeManagedPredecessor(paths, 'locked-deploy')
        const manifest = JSON.parse(readFileSync(join(paths.profileRoot, 'package.json'), 'utf8'))
        manifest.dependencies['@deepseek-ai/dsh-base'] = CURRENT_DSH_VERSION
        writeJson(join(paths.profileRoot, 'package.json'), manifest)
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('modified'), 'win32')
        writeManagedPredecessor(paths, 'original-archive')
        writeFileSync(join(paths.profileRoot, 'cordis.patch.yml'), 'modified\n', 'utf8')
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('forged-current-predecessor'), 'win32')
        writeManagedPredecessor(paths, 'original-archive')
        writeFileSync(join(paths.profileRoot, 'cordis.patch.yml'), renderProfilePatch(paths), 'utf8')
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('extra-dependency'), 'win32')
        writeManagedPredecessor(paths, 'locked-deploy')
        const manifest = JSON.parse(readFileSync(join(paths.profileRoot, 'package.json'), 'utf8'))
        manifest.dependencies['@example/extra'] = '1.0.0'
        writeJson(join(paths.profileRoot, 'package.json'), manifest)
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('archive-directory'), 'win32')
        writeManagedPredecessor(paths, 'original-archive')
        const archivePath = paths.archivePath.replace('0.1.10.tgz', '0.0.0.tgz')
        rmSync(archivePath)
        mkdirSync(archivePath)
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('archive-digest'), 'win32')
        writeManagedPredecessor(paths, 'original-archive')
        const archivePath = paths.archivePath.replace('0.1.10.tgz', '0.0.0.tgz')
        writeFileSync(archivePath, 'tampered archive\n', 'utf8')
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('mixed-runtime-archives'), 'win32')
        writeManagedPredecessor(paths, 'locked-deploy')
        writeFileSync(paths.archivePath, 'unproven current archive\n', 'utf8')
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('missing-receipt'), 'win32')
        writeManagedPredecessor(paths, 'locked-deploy')
        rmSync(paths.receiptPath)
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('mismatched-receipt'), 'win32')
        writeManagedPredecessor(paths, 'locked-deploy')
        const receipt = JSON.parse(readFileSync(paths.receiptPath, 'utf8'))
        receipt.dshVersion = CURRENT_DSH_VERSION
        writeJson(paths.receiptPath, receipt)
        return paths
      })(),
    ]

    for (const paths of incompatible) {
      const before = snapshotTree(paths.dataDir)
      const scripted = scriptedInstaller(paths)
      expect(classifyManagedInstallation(paths)).toBe('incompatible')
      expect(() => installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })).toThrow()
      expect(scripted.calls).toEqual([])
      expect(snapshotTree(paths.dataDir)).toEqual(before)
    }
  })

  it('recognizes only a complete same-DSH Runtime 0.1.9 predecessor before child effects', () => {
    const runtime016Fixture = deriveInstallPaths(testRoot('runtime-predecessor'), 'win32')
    writeManagedRuntimePredecessor(runtime016Fixture)

    expect(classifyManagedInstallation(runtime016Fixture)).toBe('managed-runtime-predecessor')

    const incompatible = [
      (() => {
        const paths = deriveInstallPaths(testRoot('runtime-predecessor-missing-archive'), 'win32')
        writeManagedRuntimePredecessor(paths)
        rmSync(runtimePredecessorArchivePath(paths))
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('runtime-predecessor-tampered-archive'), 'win32')
        writeManagedRuntimePredecessor(paths)
        writeFileSync(runtimePredecessorArchivePath(paths), 'tampered archive\n', 'utf8')
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('runtime-predecessor-mismatched-receipt'), 'win32')
        writeManagedRuntimePredecessor(paths)
        const receipt = JSON.parse(readFileSync(paths.receiptPath, 'utf8'))
        receipt.archivePath = paths.archivePath
        writeJson(paths.receiptPath, receipt)
        return paths
      })(),
      (() => {
        const paths = deriveInstallPaths(testRoot('runtime-predecessor-tampered-profile'), 'win32')
        writeManagedRuntimePredecessor(paths)
        writeFileSync(join(paths.profileRoot, 'cordis.patch.yml'), 'tampered\n', 'utf8')
        return paths
      })(),
    ]

    for (const paths of incompatible) {
      const before = snapshotTree(paths.dataDir)
      const scripted = scriptedInstaller(paths)
      expect(classifyManagedInstallation(paths)).toBe('incompatible')
      expect(() => installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })).toThrow()
      expect(scripted.calls).toEqual([])
      expect(snapshotTree(paths.dataDir)).toEqual(before)
    }
  })

  it('rejects a predecessor receipt whose binDir differs from the current install path', () => {
    const paths = deriveInstallPaths(testRoot('mismatched-receipt-bin-dir'), 'win32')
    writeManagedPredecessor(paths, 'locked-deploy')
    const receipt = JSON.parse(readFileSync(paths.receiptPath, 'utf8'))
    expect(receipt.binDir).toBe(paths.binDir)
    receipt.binDir = resolve(paths.dataDir, 'tampered-bin')
    writeJson(paths.receiptPath, receipt)
    const before = snapshotTree(paths.dataDir)
    const scripted = scriptedInstaller(paths)

    expect(classifyManagedInstallation(paths)).toBe('incompatible')
    expect(() => installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })).toThrow()
    expect(scripted.calls).toEqual([])
    expect(snapshotTree(paths.dataDir)).toEqual(before)
  })

  it('rejects a predecessor receipt whose cliPath differs from the installed Runtime CLI', () => {
    const paths = deriveInstallPaths(testRoot('mismatched-receipt-cli-path'), 'win32')
    writeManagedPredecessor(paths, 'locked-deploy')
    const receipt = JSON.parse(readFileSync(paths.receiptPath, 'utf8'))
    const installedCli = resolve(
      paths.profileRoot,
      'node_modules',
      '@tianwen',
      'runtime-bundle',
      'dist',
      'cli.js',
    )
    expect(receipt.cliPath).toBe(installedCli)
    receipt.cliPath = resolve(paths.dataDir, 'tampered-cli.js')
    writeJson(paths.receiptPath, receipt)
    const before = snapshotTree(paths.dataDir)
    const scripted = scriptedInstaller(paths)

    expect(classifyManagedInstallation(paths)).toBe('incompatible')
    expect(() => installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })).toThrow()
    expect(scripted.calls).toEqual([])
    expect(snapshotTree(paths.dataDir)).toEqual(before)
  })

  it('accepts a predecessor receipt whose cliPath is the canonical pnpm-linked Runtime CLI', () => {
    const paths = deriveInstallPaths(testRoot('pnpm-linked-predecessor-cli'), 'win32')
    writeManagedPredecessor(paths, 'locked-deploy')
    const publicRuntime = join(
      paths.profileRoot,
      'node_modules',
      '@tianwen',
      'runtime-bundle',
    )
    const canonicalRuntime = join(
      paths.profileRoot,
      'node_modules',
      '.pnpm',
      '@tianwen+runtime-bundle@0.0.0',
      'node_modules',
      '@tianwen',
      'runtime-bundle',
    )
    mkdirSync(dirname(canonicalRuntime), { recursive: true })
    renameSync(publicRuntime, canonicalRuntime)
    symlinkSync(canonicalRuntime, publicRuntime, 'junction')
    const publicCli = join(publicRuntime, 'dist', 'cli.js')
    const canonicalCli = realpathSync(publicCli)
    expect(canonicalCli).not.toBe(publicCli)
    const receipt = JSON.parse(readFileSync(paths.receiptPath, 'utf8'))
    receipt.cliPath = canonicalCli
    writeJson(paths.receiptPath, receipt)

    expect(realpathSync(publicCli)).toBe(receipt.cliPath)
    expect(classifyManagedInstallation(paths)).toBe('managed-predecessor')
  })

  it('rejects a source-linked predecessor before child or persistent effects', () => {
    const paths = deriveInstallPaths(testRoot('source-linked-predecessor'), 'win32')
    const repoRoot = testRoot('source-linked-predecessor-repo')
    const sourceCli = join(
      repoRoot,
      'packages',
      'tianwen-runtime-bundle',
      'dist',
      'cli.js',
    )
    const installedCli = join(
      paths.profileRoot,
      'node_modules',
      '@tianwen',
      'runtime-bundle',
      'dist',
      'cli.js',
    )
    writeRuntimeRepository(repoRoot, 'predecessor-source')
    writeManagedPredecessor(paths, 'locked-deploy')
    rmSync(installedCli)
    linkSync(sourceCli, installedCli)
    expect(statSync(sourceCli, { bigint: true }).ino)
      .toBe(statSync(installedCli, { bigint: true }).ino)
    const before = snapshotTree(paths.dataDir)
    const scripted = scriptedInstaller(paths)

    expect(() => installWindowsFixture({
      dataDir: paths.dataDir,
      repoRoot,
      runner: scripted.runner,
    })).toThrow(/must not be source-linked/u)
    expect(scripted.calls).toEqual([])
    expect(snapshotTree(paths.dataDir)).toEqual(before)
  })

  it('rejects a DSH package that resolves outside its managed host root', () => {
    const hostRoot = testRoot('linked-host')
    const externalRoot = testRoot('external-dsh-package')
    const packageRoot = join(externalRoot, 'dsh')
    mkdirSync(join(packageRoot, 'lib'), { recursive: true })
    writeFileSync(join(packageRoot, 'lib', 'bin.js'), 'export {}\n', 'utf8')
    writeJson(join(packageRoot, 'package.json'), {
      bin: { dsh: 'lib/bin.js' },
      version: CURRENT_DSH_VERSION,
    })
    const linkedPackage = join(hostRoot, 'node_modules', '@deepseek-ai', 'dsh')
    mkdirSync(dirname(linkedPackage), { recursive: true })
    symlinkSync(packageRoot, linkedPackage, 'junction')

    expect(() => validateInstalledHost(hostRoot)).toThrow(/DSH package escapes its managed root/u)
  })

  it.each(['original-archive', 'locked-deploy'] as const)(
    'migrates the complete %s predecessor to the current version and replays without deploys',
    (encoding) => {
      const paths = deriveInstallPaths(testRoot(`migrate-${encoding}`), 'win32')
      const predecessorArchive = paths.archivePath.replace('0.1.10.tgz', '0.0.0.tgz')
      writeManagedPredecessor(paths, encoding)
      const session = join(paths.sessionsRoot, 'kept.jsonl')
      const ledger = join(paths.evolutionRoot, 'ledger.jsonl')
      mkdirSync(paths.sessionsRoot, { recursive: true })
      mkdirSync(paths.evolutionRoot, { recursive: true })
      writeFileSync(session, 'session bytes\n', 'utf8')
      writeFileSync(ledger, 'ledger bytes\n', 'utf8')
      const durableBefore = [readFileSync(session), readFileSync(ledger)]
      const scripted = scriptedInstaller(paths)

      const migrated = installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })

      expect(validateInstalledHost(paths.hostRoot)).toContain('bin.js')
      expect(readFileSync(join(paths.profileRoot, 'package.json'), 'utf8')).toContain(CURRENT_DSH_VERSION)
      expect(migrated.status).toBe('ready')
      expect(existsSync(predecessorArchive)).toBe(true)
      expect([readFileSync(session), readFileSync(ledger)]).toEqual(durableBefore)
      expect(readdirSync(dirname(paths.hostRoot)).filter(name => name.startsWith('.dsh-host-backup-'))).toEqual([])
      const deployCount = scripted.calls.filter(argv => argv.includes('deploy')).length
      expect(installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })).toEqual(migrated)
      expect(scripted.calls.filter(argv => argv.includes('deploy'))).toHaveLength(deployCount)
      expect(scripted.calls.every(argv => !argv.includes('plugin') && !argv.includes('--online'))).toBe(true)
    },
  )

  it('migrates Runtime 0.1.9 while retaining older archives without redeploying the same DSH host', () => {
    const paths = deriveInstallPaths(testRoot('migrate-runtime-predecessor'), 'win32')
    const predecessorArchive = runtimePredecessorArchivePath(paths)
    const historicalArchive = paths.archivePath.replace('0.1.10.tgz', '0.0.0.tgz')
    const historicalRuntimeArchive = paths.archivePath.replace('0.1.10.tgz', '0.1.1.tgz')
    writeManagedRuntimePredecessor(paths)
    writeFileSync(historicalArchive, 'retained rc7 archive\n', 'utf8')
    writeFileSync(historicalRuntimeArchive, 'retained Runtime 0.1.1 archive\n', 'utf8')
    const scripted = scriptedInstaller(paths)

    expect(classifyManagedInstallation(paths)).toBe('managed-runtime-predecessor')
    const migrated = installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })

    expect(classifyManagedInstallation(paths)).toBe('current')
    expect(scripted.calls.filter(argv => argv.includes('@tianwen/dsh-host'))).toHaveLength(0)
    expect(scripted.calls.filter(argv => argv.includes('@tianwen/profile-host'))).toHaveLength(1)
    expect(existsSync(historicalArchive)).toBe(true)
    expect(existsSync(historicalRuntimeArchive)).toBe(true)
    expect(existsSync(predecessorArchive)).toBe(true)
    expect(existsSync(paths.archivePath)).toBe(true)
    expect(JSON.parse(readFileSync(join(paths.profileRoot, 'package.json'), 'utf8')))
      .toMatchObject({ dependencies: { '@tianwen/runtime-bundle': '0.1.10' } })
    expect(JSON.parse(readFileSync(join(
      paths.profileRoot,
      'node_modules',
      '@tianwen',
      'runtime-bundle',
      'package.json',
    ), 'utf8'))).toMatchObject({ version: '0.1.10' })
    expect(JSON.parse(readFileSync(paths.receiptPath, 'utf8'))).toEqual(migrated)
    expect(migrated).toMatchObject({
      archivePath: paths.archivePath,
      dshVersion: CURRENT_DSH_VERSION,
      status: 'ready',
    })
  })

  it('restores the complete Runtime 0.1.9 predecessor after a pre-commit failure', () => {
    const paths = deriveInstallPaths(testRoot('runtime-predecessor-rollback'), 'win32')
    writeManagedRuntimePredecessor(paths)
    const before = snapshotTree(paths.dataDir)
    const scripted = scriptedInstaller(paths, '@tianwen/profile-host')

    expect(() => installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner }))
      .toThrow(/scripted failure/u)
    expect(scripted.calls.filter(argv => argv.includes('@tianwen/dsh-host'))).toHaveLength(0)
    expect(snapshotTree(paths.dataDir)).toEqual(before)
    expect(existsSync(runtimePredecessorArchivePath(paths))).toBe(true)
    expect(existsSync(paths.archivePath)).toBe(false)
  })

  it.each([
    ['partial host deploy', '@tianwen/dsh-host', 'partial-host'],
    ['failure after current host validation', 'build', 'post-host-validation'],
  ])('restores the predecessor installation after %s', (_label, failOn, fixtureName) => {
    const paths = deriveInstallPaths(testRoot(`migration-rollback-${fixtureName}`), 'win32')
    writeManagedPredecessor(paths, 'original-archive')
    const session = join(paths.sessionsRoot, 'kept.jsonl')
    const ledger = join(paths.evolutionRoot, 'ledger.jsonl')
    mkdirSync(paths.sessionsRoot, { recursive: true })
    mkdirSync(paths.evolutionRoot, { recursive: true })
    writeFileSync(session, 'session bytes\n', 'utf8')
    writeFileSync(ledger, 'ledger bytes\n', 'utf8')
    const before = snapshotTree(paths.dataDir)
    const scripted = scriptedInstaller(paths, failOn)

    expect(() => installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })).toThrow(/scripted failure/u)
    expect(snapshotTree(paths.dataDir)).toEqual(before)
    expect(readdirSync(dirname(paths.hostRoot)).filter(name => name.startsWith('.dsh-host-backup-'))).toEqual([])
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
      dshVersion: CURRENT_DSH_VERSION,
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

    const first = installWindowsFixture({ dataDir: root, runner: scripted.runner })
    const receiptBytes = readFileSync(paths.receiptPath)
    const managedBytes = [
      join(paths.hostRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
      paths.archivePath,
      join(paths.profileRoot, 'package.json'),
      join(paths.profileRoot, 'pnpm-workspace.yaml'),
      join(paths.profileRoot, 'cordis.patch.yml'),
    ].map(path => readFileSync(path))
    const replay = installWindowsFixture({ dataDir: root, runner: scripted.runner })

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
    expect(scripted.calls.every(argv => !argv.includes(session) && !argv.includes(ledger))).toBe(true)
  })

  it('assigns every child lifetime to its installer stage', () => {
    const root = testRoot('stage-timeouts')
    const paths = deriveInstallPaths(root, 'win32')
    const scripted = scriptedInstaller(paths)

    installWindowsFixture({ dataDir: root, runner: scripted.runner })

    const workspaceInstallIndex = scripted.calls.findIndex(argv =>
      argv.includes('install') && argv.includes('--offline'))
    const hostDeployIndex = scripted.calls.findIndex(argv =>
      argv.includes('deploy') && argv.includes('@tianwen/dsh-host'))
    const profileDeployIndex = scripted.calls.findIndex(argv =>
      argv.includes('deploy') && argv.includes('@tianwen/profile-host'))
    const dshConfigIndexes = scripted.calls
      .map((argv, index) => argv.includes('--dump-config') ? index : -1)
      .filter(index => index >= 0)
    const pnpmVersionIndex = scripted.calls.findIndex(argv =>
      /pnpm\.(?:c?js|mjs)$/iu.test(argv[0] ?? '') && argv[1] === '--version')
    expect(scripted.spawnOptions[workspaceInstallIndex]?.timeout).toBe(0)
    expect(scripted.spawnOptions[hostDeployIndex]?.timeout).toBe(0)
    expect(scripted.spawnOptions[profileDeployIndex]?.timeout).toBe(0)
    expect(dshConfigIndexes).toHaveLength(1)
    expect(dshConfigIndexes.map(index => scripted.spawnOptions[index]?.timeout))
      .toEqual([0])
    expect(scripted.spawnOptions[pnpmVersionIndex]?.timeout).toBe(120_000)

    const buildAndPackIndexes = scripted.calls
      .map((argv, index) => argv.includes('build') || argv.includes('pack') ? index : -1)
      .filter(index => index >= 0)
    expect(buildAndPackIndexes.map(index => scripted.spawnOptions[index]?.timeout))
      .toEqual([300_000, 300_000, 300_000, 300_000])
    const completionOwnedIndexes = [
      workspaceInstallIndex,
      hostDeployIndex,
      profileDeployIndex,
      ...dshConfigIndexes,
    ]
    expect(scripted.spawnOptions.filter((_options, index) =>
      !completionOwnedIndexes.includes(index))
      .every(options => options.timeout > 0)).toBe(true)
  })

  it('accepts a folded DSH sessions root and rejects a different folded root', () => {
    const root = testRoot('long-folded-root')
    const paths = deriveInstallPaths(root, 'win32')
    const accepted = scriptedInstaller(paths, undefined, undefined, { foldedSessionsRoot: true })

    installWindowsFixture({ dataDir: root, runner: accepted.runner })

    expect(() => installWindowsFixture({
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
  stateRoot: D:/DevData/tianwen-live-goal-round/test-data/installed-e2e/state
  sessionsRoot: D:/DevData/tianwen-live-goal-round/test-data/installed-e2e/dsh-home/sessions
  learningLoop:
    enabled: true
    workspaceRoot: D:/DevData/tianwen-live-goal-round/test-data/installed-e2e/state/learning-loop
- id: tianwen-web-bridge
  name: '@tianwen/runtime-bundle'
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

    expect(() => installWindowsFixture({ dataDir: root, runner: scripted.runner })).toThrow()
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

    expect(() => installWindowsFixture({ dataDir: root, runner: scripted.runner })).toThrow(/scripted failure/u)
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

    expect(() => installWindowsFixture({
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
    installWindowsFixture({ dataDir: root, runner: scriptedInstaller(paths).runner })
    const archiveBefore = readFileSync(paths.archivePath)
    const receiptBefore = readFileSync(paths.receiptPath)

    expect(() => installWindowsFixture({
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
    installWindowsFixture({
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

    expect(() => installWindowsFixture({ dataDir: root, runner: unstable.runner }))
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

  it('protects the current Profile from source-linked builds', () => {
    const root = testRoot('source-linked-build')
    const paths = deriveInstallPaths(root, 'win32')
    const repoRoot = testRoot('source-linked-repo')
    const buildOutputs = [
      'tianwen-dsh-compat',
      'tianwen-evolution',
      'tianwen-evidence',
      'tianwen-runtime',
      'tianwen-runtime-bundle',
    ].map(name => join(repoRoot, 'packages', name, 'dist'))
    for (const output of buildOutputs) mkdirSync(output, { recursive: true })
    const runtimeRoot = join(repoRoot, 'packages', 'tianwen-runtime-bundle')
    const sourceCli = join(runtimeRoot, 'dist', 'cli.js')
    writeRuntimeRepository(repoRoot, 'source-initial')
    installWindowsFixture({
      dataDir: root,
      repoRoot,
      runner: scriptedInstaller(paths).runner,
    })
    for (const output of buildOutputs) mkdirSync(output, { recursive: true })
    writeFileSync(sourceCli, 'source runtime before build\n', 'utf8')
    const installedCli = join(
      paths.profileRoot,
      'node_modules',
      '@tianwen',
      'runtime-bundle',
      'dist',
      'cli.js',
    )
    rmSync(installedCli)
    linkSync(sourceCli, installedCli)
    expect(statSync(sourceCli, { bigint: true }).ino)
      .toBe(statSync(installedCli, { bigint: true }).ino)
    const before = snapshotTree(paths.dataDir)
    const unstable = scriptedInstaller(
      paths,
      undefined,
      ['unstable runtime one\n', 'unstable runtime two\n'],
      {},
      {
        onBuild(ordinal) {
          if (ordinal !== 0) return
          mkdirSync(dirname(sourceCli), { recursive: true })
          writeFileSync(sourceCli, 'source runtime after build\n', 'utf8')
        },
      },
    )

    expect(() => installWindowsFixture({ dataDir: root, repoRoot, runner: unstable.runner }))
      .toThrow('Runtime Bundle archive is not stable across consecutive builds')
    expect(readFileSync(sourceCli, 'utf8')).toBe('source runtime after build\n')
    expect(readFileSync(installedCli, 'utf8')).toBe('source runtime before build\n')
    expect(snapshotTree(paths.dataDir)).toEqual(before)
    expect(unstable.calls.filter(argv => argv.includes('@tianwen/profile-host'))).toHaveLength(0)
  })

  it('replaces a source-linked current Profile when the archive is unchanged', () => {
    const root = testRoot('source-linked-replay')
    const paths = deriveInstallPaths(root, 'win32')
    const repoRoot = testRoot('source-linked-replay-repo')
    const sourceRuntimeRoot = join(repoRoot, 'packages', 'tianwen-runtime-bundle')
    writeRuntimeRepository(repoRoot, 'source-initial')
    installWindowsFixture({
      dataDir: root,
      repoRoot,
      runner: scriptedInstaller(paths).runner,
    })
    writeRuntimeRepository(repoRoot, 'source-before')
    const installedCli = join(
      paths.profileRoot,
      'node_modules',
      '@tianwen',
      'runtime-bundle',
      'dist',
      'cli.js',
    )
    rmSync(installedCli)
    linkSync(join(sourceRuntimeRoot, 'dist', 'cli.js'), installedCli)
    const replay = scriptedInstaller(paths, undefined, undefined, {}, {
      onBuild(ordinal) {
        if (ordinal === 0) writeRuntimePublication(sourceRuntimeRoot, 'source-built')
      },
    })

    installWindowsFixture({ dataDir: root, repoRoot, runner: replay.runner })

    expect(replay.calls.filter(argv => argv.includes('@tianwen/profile-host'))).toHaveLength(1)
    expect(replay.calls.filter(argv => argv.includes('@tianwen/dsh-host'))).toHaveLength(0)
  })

  it('repairs a source-linked current Profile whose package LICENSE is absent', () => {
    const root = testRoot('source-linked-missing-license')
    const paths = deriveInstallPaths(root, 'win32')
    const repoRoot = testRoot('source-linked-missing-license-repo')
    const sourceRuntimeRoot = join(repoRoot, 'packages', 'tianwen-runtime-bundle')
    writeRuntimeRepository(repoRoot, 'source-initial')
    installWindowsFixture({
      dataDir: root,
      repoRoot,
      runner: scriptedInstaller(paths).runner,
    })
    const installedRuntimeRoot = join(
      paths.profileRoot,
      'node_modules',
      '@tianwen',
      'runtime-bundle',
    )
    rmSync(join(installedRuntimeRoot, 'LICENSE'))
    writeRuntimePublication(sourceRuntimeRoot, 'source-before')
    const installedCli = join(installedRuntimeRoot, 'dist', 'cli.js')
    rmSync(installedCli)
    linkSync(join(sourceRuntimeRoot, 'dist', 'cli.js'), installedCli)
    expect(classifyManagedInstallation(paths)).toBe('current')
    expect(existsSync(join(installedRuntimeRoot, 'LICENSE'))).toBe(false)
    const replay = scriptedInstaller(paths, undefined, undefined, {}, {
      onBuild(ordinal) {
        if (ordinal === 0) writeRuntimePublication(sourceRuntimeRoot, 'source-built')
      },
    })

    installWindowsFixture({ dataDir: root, repoRoot, runner: replay.runner })

    expect(replay.calls.filter(argv => argv.includes('@tianwen/profile-host'))).toHaveLength(1)
    expect(replay.calls.filter(argv => argv.includes('@tianwen/dsh-host'))).toHaveLength(0)
    expect(readFileSync(join(installedRuntimeRoot, 'LICENSE'), 'utf8'))
      .toBe('source-initial:license\n')
    expect(statSync(join(installedRuntimeRoot, 'LICENSE'), { bigint: true }).nlink).toBe(1n)
  })

  it('publishes a detached Runtime Bundle candidate', () => {
    expect(RUNTIME_PUBLICATION).toHaveLength(20)
    const root = testRoot('detached-runtime-candidate')
    const paths = deriveInstallPaths(root, 'win32')
    const repoRoot = testRoot('detached-runtime-repo')
    const sourceRuntimeRoot = join(repoRoot, 'packages', 'tianwen-runtime-bundle')
    writeRuntimeRepository(repoRoot, 'source-before')
    const scripted = scriptedInstaller(paths, undefined, undefined, {}, {
      onBuild(ordinal) {
        if (ordinal === 0) writeRuntimePublication(sourceRuntimeRoot, 'source-built')
      },
      runtimeSourceRoot: sourceRuntimeRoot,
    })

    installWindowsFixture({ dataDir: root, repoRoot, runner: scripted.runner })

    const installedRuntimeRoot = join(
      paths.profileRoot,
      'node_modules',
      '@tianwen',
      'runtime-bundle',
    )
    for (const path of RUNTIME_PUBLICATION) {
      const sourcePath = path === 'LICENSE' ? join(repoRoot, 'LICENSE') : join(sourceRuntimeRoot, path)
      const source = statSync(sourcePath, { bigint: true })
      const installed = statSync(join(installedRuntimeRoot, path), { bigint: true })
      expect({ dev: installed.dev, ino: installed.ino }).not.toEqual({ dev: source.dev, ino: source.ino })
      expect(installed.nlink).toBe(1n)
    }
    expect(existsSync(join(sourceRuntimeRoot, 'LICENSE'))).toBe(false)
    expect(readFileSync(join(installedRuntimeRoot, 'LICENSE'), 'utf8'))
      .toBe('source-before:license\n')
    writeFileSync(join(sourceRuntimeRoot, 'dist', 'cli.js'), 'source-after-receipt\n', 'utf8')
    writeFileSync(join(repoRoot, 'LICENSE'), 'license-after-receipt\n', 'utf8')
    expect(readFileSync(join(installedRuntimeRoot, 'dist', 'cli.js'), 'utf8'))
      .toBe('source-built:dist/cli.js\n')
    expect(readFileSync(join(installedRuntimeRoot, 'LICENSE'), 'utf8'))
      .toBe('source-before:license\n')
  })

  it.each([
    ['build one', 'runtime-bundle-build-1', undefined, 'runtime-bundle-build-1'],
    ['pack one', 'runtime-bundle-pack-1', undefined, 'runtime-bundle-pack-1'],
    ['build two', 'runtime-bundle-build-2', undefined, 'runtime-bundle-build-2'],
    ['pack two', 'runtime-bundle-pack-2', undefined, 'runtime-bundle-pack-2'],
    [
      'archive stability',
      undefined,
      ['unstable runtime one\n', 'unstable runtime two\n'],
      'archive-stability',
    ],
    ['partial Profile deploy', '@tianwen/profile-host', undefined, 'managed-profile-deploy'],
    [
      'Profile validation',
      'managed-profile-validation',
      undefined,
      'managed-profile-validation',
    ],
    ['DSH config validation', 'dsh-config-validation', undefined, 'dsh-config-validation'],
    ['archive publication', 'archive-publication', undefined, 'archive-publication'],
    ['receipt publication', 'receipt-publication-path', undefined, 'receipt-publication'],
  ] as const)(
    'restores a source-linked current installation after %s failure',
    (_label, failOn, archiveBytes, expectedStage) => {
      const root = testRoot(`source-linked-failure-${expectedStage}`)
      const paths = deriveInstallPaths(root, 'win32')
      const repoRoot = testRoot(`source-linked-failure-repo-${expectedStage}`)
      const sourceRuntimeRoot = join(repoRoot, 'packages', 'tianwen-runtime-bundle')
      writeRuntimeRepository(repoRoot, 'source-initial')
      installWindowsFixture({
        dataDir: root,
        repoRoot,
        runner: scriptedInstaller(paths).runner,
      })
      writeRuntimePublication(sourceRuntimeRoot, 'source-before')
      const installedCli = join(
        paths.profileRoot,
        'node_modules',
        '@tianwen',
        'runtime-bundle',
        'dist',
        'cli.js',
      )
      rmSync(installedCli)
      linkSync(join(sourceRuntimeRoot, 'dist', 'cli.js'), installedCli)
      mkdirSync(paths.sessionsRoot, { recursive: true })
      mkdirSync(paths.evolutionRoot, { recursive: true })
      writeFileSync(join(paths.sessionsRoot, 'kept.jsonl'), 'session bytes\n', 'utf8')
      writeFileSync(join(paths.evolutionRoot, 'ledger.jsonl'), 'ledger bytes\n', 'utf8')
      if (expectedStage === 'receipt-publication') {
        rmSync(paths.receiptPath)
        mkdirSync(paths.receiptPath)
      }
      const before = snapshotTree(paths.dataDir)
      const scripted = scriptedInstaller(paths, failOn, archiveBytes, {}, {
        onBuild(ordinal) {
          if (ordinal === 0) writeRuntimePublication(sourceRuntimeRoot, 'source-built')
        },
      })

      expect(failureReceipt(() => installWindowsFixture({
        dataDir: root,
        repoRoot,
        runner: scripted.runner,
      }))).toEqual({
        schemaVersion: 'tianwen.install-failure.v1',
        status: 'failed',
        stage: expectedStage,
      })
      expect(snapshotTree(paths.dataDir)).toEqual(before)
      expect(scripted.calls.filter(argv => argv.includes('@tianwen/dsh-host'))).toHaveLength(0)
    },
  )

  it('reuses caller-configured D-drive package stores', () => {
    const root = testRoot('configured-store')
    const paths = deriveInstallPaths(root, 'win32')
    const scripted = scriptedInstaller(paths)
    installWindowsFixture({
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

  it('serializes only Runtime Bundle pack children', () => {
    const root = testRoot('fixed-pnpm-worker')
    const paths = deriveInstallPaths(root, 'win32')
    const scripted = scriptedInstaller(paths)

    installWindowsFixture({
      dataDir: root,
      env: { ...process.env, UV_THREADPOOL_SIZE: '64' },
      runner: scripted.runner,
    })

    const pnpmChildren = scripted.calls.map((argv, index) => ({
      argv,
      env: scripted.childEnvironments[index]!,
    })).filter(({ argv }) => /pnpm\.(?:c?js|mjs)$/iu.test(argv[0] ?? ''))
    const packChildren = pnpmChildren.filter(({ argv }) => argv.includes('pack'))
    const ordinaryChildren = pnpmChildren.filter(({ argv }) => !argv.includes('pack'))

    expect(packChildren).toHaveLength(2)
    expect(packChildren.every(({ env }) => env.UV_THREADPOOL_SIZE === '1')).toBe(true)
    expect(ordinaryChildren.every(({ env }) => env.UV_THREADPOOL_SIZE === undefined)).toBe(true)
  })

  it('reinstalls the fixed Profile when the Runtime archive changes', () => {
    const root = testRoot('upgrade')
    const paths = deriveInstallPaths(root, 'win32')
    const first = scriptedInstaller(paths, undefined, 'runtime v1\n')
    const receiptV1 = installWindowsFixture({ dataDir: root, runner: first.runner })
    const second = scriptedInstaller(paths, undefined, 'runtime v2\n')
    const receiptV2 = installWindowsFixture({ dataDir: root, runner: second.runner })

    expect(receiptV2.archiveDigest).not.toBe(receiptV1.archiveDigest)
    expect(second.calls.filter(argv => argv.includes('@tianwen/profile-host'))).toHaveLength(1)
    expect(second.calls.filter(argv => argv.includes('plugin'))).toHaveLength(0)
  })

  it('keeps the previous Profile and receipt when a Profile upgrade fails', () => {
    const root = testRoot('failed-profile-upgrade')
    const paths = deriveInstallPaths(root, 'win32')
    installWindowsFixture({ dataDir: root, runner: scriptedInstaller(paths, undefined, 'runtime v1\n').runner })
    const archiveBefore = readFileSync(paths.archivePath)
    const profileBefore = readFileSync(join(paths.profileRoot, 'package.json'))
    const receiptBefore = readFileSync(paths.receiptPath)

    expect(() => installWindowsFixture({
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
    installWindowsFixture({ dataDir: root, runner: scriptedInstaller(paths, undefined, 'runtime v1\n').runner })
    const archiveBefore = readFileSync(paths.archivePath)
    const profileBefore = readFileSync(join(paths.profileRoot, 'package.json'))
    const receiptBefore = readFileSync(paths.receiptPath)

    expect(() => installWindowsFixture({
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

    expect(() => installWindowsFixture({
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
      installWindowsFixture({ dataDir: root, runner: initial.runner })
      const receiptBefore = readFileSync(paths.receiptPath)
      writeFileSync(join(paths.profileRoot, managedFile), 'user-modified\n', 'utf8')
      const rejected = scriptedInstaller(paths)

      expect(() => installWindowsFixture({ dataDir: root, runner: rejected.runner }))
        .toThrow(/differs from Tianwen v1/u)
      expect(rejected.calls).toEqual([])
      expect(readFileSync(paths.receiptPath)).toEqual(receiptBefore)
    },
  )
})
