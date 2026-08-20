import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { targetExistsInsidePackage } from '../../scripts/check-dsh-install.mjs'

const root = resolve(import.meta.dirname, '../..')
const expectedLibraries = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-loop',
  '@deepseek-ai/dsh-agent-loop-testkit',
  '@deepseek-ai/dsh-cordis-host-runner',
  '@deepseek-ai/dsh-goal',
  '@deepseek-ai/dsh-goal-round-driver',
  '@deepseek-ai/dsh-jobs-local',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-message-feedback',
  '@deepseek-ai/dsh-sandbox',
  '@deepseek-ai/dsh-sandbox-local',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-persistence-jsonl',
  '@deepseek-ai/dsh-session-query',
  '@deepseek-ai/dsh-session-query-sqlite',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-tool-goal',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-workflow-worker-thread',
] as const

function pnpmVersionCommand(): { executable: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { executable: 'pnpm', args: ['--version'] }
  }
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    packageManager: string
  }
  const version = manifest.packageManager.split('@').at(-1)
  const corepackHome = process.env.COREPACK_HOME
  if (version === undefined || corepackHome === undefined) {
    throw new Error('exact pnpm runtime is unavailable')
  }
  const pnpmModule = resolve(corepackHome, 'v1', 'pnpm', version, 'bin', 'pnpm.mjs')
  if (!existsSync(pnpmModule)) {
    throw new Error(`exact pnpm runtime is unavailable: ${pnpmModule}`)
  }
  return { executable: process.execPath, args: [pnpmModule, '--version'] }
}

describe('published DeepSeek Harness closure', () => {
  it('pins every installed DSH package to rc.7', () => {
    const output = execFileSync(
      process.execPath,
      [resolve(root, 'scripts/check-dsh-install.mjs')],
      { cwd: root, encoding: 'utf8', shell: false },
    )
    const report = JSON.parse(output) as {
      expectedDshVersion: string
      installedPackages: Array<{ name: string; version: string }>
      packageSurfaces: Array<{
        name: string
        kind: 'cli' | 'library'
        rootExport: boolean
        typesTarget: boolean
        defaultTarget: boolean
        cliTarget: boolean
      }>
    }
    expect(report.expectedDshVersion).toBe('0.1.0-rc.7')
    expect(report.installedPackages.length).toBeGreaterThan(10)
    expect(new Set(report.installedPackages.map(item => item.version)))
      .toEqual(new Set(['0.1.0-rc.7']))

    const cli = report.packageSurfaces.find(
      item => item.name === '@deepseek-ai/dsh',
    )
    expect(cli).toMatchObject({
      kind: 'cli',
      rootExport: false,
      cliTarget: true,
    })

    const libraries = report.packageSurfaces.filter(
      item => item.kind === 'library',
    )
    expect(report.packageSurfaces.map(item => item.name)).toEqual([
      '@deepseek-ai/dsh',
      ...expectedLibraries,
    ])
    expect(libraries.map(item => item.name)).toEqual(expectedLibraries)
    expect(libraries.every(
      item => item.rootExport && item.typesTarget && item.defaultTarget,
    )).toBe(true)
  })

  it('commits a lockfile and uses no floating DSH ranges', () => {
    expect(readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8')).toContain('lockfileVersion:')
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
    }
    for (const [name, version] of Object.entries(manifest.devDependencies)) {
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
        expect(version).toBe('0.1.0-rc.7')
      }
    }
    const compatManifest = JSON.parse(readFileSync(
      resolve(root, 'packages/tianwen-dsh-compat/package.json'),
      'utf8',
    )) as { dependencies: Record<string, string> }
    for (const [name, version] of Object.entries(compatManifest.dependencies)) {
      if (name.startsWith('@deepseek-ai/dsh-')) {
        expect(version).toBe('0.1.0-rc.7')
      }
    }
    const command = pnpmVersionCommand()
    expect(() => execFileSync(command.executable, command.args, { cwd: root, shell: false }))
      .not.toThrow()
  })

  it('rejects private DSH source imports across supported module forms', () => {
    const fixtureRoot = mkdtempSync(resolve(
      root,
      'tests/dsh-probe/.private-import-',
    ))
    const privateSpecifier = [
      '@deepseek-ai/dsh-agent',
      'src',
      'private.js',
    ].join('/')
    const fixtures = {
      'relative-import.ts':
        "import '../../../node_modules/@deepseek-ai/dsh-agent/src/private.js'\n",
      'template-import.ts': [
        "const packageName = 'dsh-agent'",
        'void import /* private seam */ (`@deepseek-ai/${packageName}/src/private.js`)',
        '',
      ].join('\n'),
      'concatenated-import.ts': [
        "const packageName = 'dsh-agent'",
        "void import('@deepseek-ai/' + packageName + '/src/private.js')",
        '',
      ].join('\n'),
      'create-require.ts': [
        "import { createRequire } from 'node:module'",
        'const privateRequire = createRequire(import.meta.url)',
        `privateRequire(${JSON.stringify(privateSpecifier)})`,
        '',
      ].join('\n'),
      'commonjs-create-require.cts': [
        "const { createRequire: makeRequire } = require('node:module')",
        'const privateRequire = makeRequire(__filename)',
        `privateRequire(${JSON.stringify(privateSpecifier)})`,
        '',
      ].join('\n'),
      'await-create-require.ts': [
        "const { createRequire: makeRequire } = await import('node:module')",
        'const privateRequire = makeRequire(import.meta.url)',
        `privateRequire(${JSON.stringify(privateSpecifier)})`,
        '',
      ].join('\n'),
      'split-scope-template.ts':
        "void import(`@deepseek-${'ai'}/dsh-agent/src/private.js`)\n",
      'dynamic-src-token.ts': [
        "const srcPart = 'src'",
        "void import('@deepseek-ai/dsh-agent/' + srcPart + '/private.js')",
        '',
      ].join('\n'),
      'aliased-inline-create-require.ts': [
        "import { createRequire as makeRequire } from 'node:module'",
        `makeRequire(import.meta.url)(${JSON.stringify(privateSpecifier)})`,
        '',
      ].join('\n'),
      'require-resolve.cts':
        `require.resolve(${JSON.stringify(privateSpecifier)})\n`,
    }
    for (const [name, source] of Object.entries(fixtures)) {
      writeFileSync(resolve(fixtureRoot, name), source, 'utf8')
    }

    try {
      const result = spawnSync(
        process.execPath,
        [resolve(root, 'scripts/check-dsh-install.mjs'), '--imports'],
        { cwd: root, encoding: 'utf8', shell: false },
      )
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('private DSH import')
      for (const name of Object.keys(fixtures)) {
        expect(result.stderr).toContain(name)
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('accepts only real files physically contained by the package root', () => {
    const fixtureBase = process.platform === 'win32'
      ? 'D:/DevData/tianwen-dsh-probe'
      : tmpdir()
    mkdirSync(fixtureBase, { recursive: true })
    const packageRoot = mkdtempSync(resolve(fixtureBase, 'package-surface-'))
    const outsideFile = `${packageRoot}-outside.mjs`
    const outsideDirectory = `${packageRoot}-outside-directory`

    mkdirSync(resolve(packageRoot, 'lib', 'directory.js'), { recursive: true })
    mkdirSync(outsideDirectory)
    writeFileSync(resolve(packageRoot, 'lib', 'valid.js'), 'export {}\n', 'utf8')
    writeFileSync(outsideFile, 'export {}\n', 'utf8')
    writeFileSync(resolve(outsideDirectory, 'escaped.js'), 'export {}\n', 'utf8')
    symlinkSync(
      outsideDirectory,
      resolve(packageRoot, 'lib', 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    try {
      expect(targetExistsInsidePackage(packageRoot, './lib/valid.js')).toBe(true)
      expect(targetExistsInsidePackage(packageRoot, './lib/directory.js')).toBe(false)
      expect(targetExistsInsidePackage(
        packageRoot,
        `../${basename(outsideFile)}`,
      )).toBe(false)
      expect(targetExistsInsidePackage(
        packageRoot,
        './lib/escape/escaped.js',
      )).toBe(false)
    } finally {
      rmSync(packageRoot, { recursive: true, force: true })
      rmSync(outsideFile, { force: true })
      rmSync(outsideDirectory, { recursive: true, force: true })
    }
  })
})
