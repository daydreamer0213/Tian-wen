import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditDesktopArtifact } from '../../scripts/audit-desktop-artifact.mjs'
import { stageDesktopRuntime } from '../../scripts/stage-desktop-runtime.mjs'

const testRoots: string[] = []
const fixtureParent = process.platform === 'win32'
  ? 'D:\\DevData\\tianwen-desktop-artifact-tests'
  : join(tmpdir(), 'tianwen-desktop-artifact-tests')

function createTestRoot(): string {
  mkdirSync(fixtureParent, { recursive: true })
  const root = mkdtempSync(join(fixtureParent, 'case-'))
  testRoots.push(root)
  return root
}

function createUnpackedRoot(runtime?: Buffer): string {
  const root = createTestRoot()
  const files = [
    'resources/app/dist/bootstrap.js',
    'resources/app/dist/host.js',
    'resources/app/dist/locale.js',
    'resources/app/dist/main.js',
    'resources/app/package.json',
    'resources/LICENSE.txt',
    'resources/THIRD_PARTY_NOTICES.md',
  ]
  if (runtime !== undefined) {
    files.push('resources/app/dist/profile-prepare.js')
    writeFixture(
      root,
      'resources/runtime/tianwen-runtime-bundle-0.1.5.tgz',
      runtime,
    )
  }
  for (const relativePath of files) writeFixture(root, relativePath, 'fixture')
  return root
}

function createRuntimeSource(contents: Buffer): string {
  const root = createTestRoot()
  const source = join(root, 'tianwen-runtime-bundle-0.1.5.tgz')
  writeFileSync(source, contents)
  return source
}

function createRuntimeArchive(includeClient: boolean): { source: string, bytes: Buffer } {
  const root = createTestRoot()
  const contents = join(root, 'contents')
  writeFixture(
    contents,
    includeClient ? 'package/dist/client.js' : 'package/dist/runtime.js',
    'fixture',
  )
  const source = join(root, 'tianwen-runtime-bundle-0.1.5.tgz')
  const executable = process.platform === 'win32'
    ? join(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar'
  const result = spawnSync(executable, ['-czf', source, '-C', contents, 'package'], {
    encoding: 'utf8',
    shell: false,
  })
  if (result.status !== 0) throw new Error(`fixture tar failed: ${result.stderr}`)
  return { source, bytes: readFileSync(source) }
}

function writeFixture(root: string, relativePath: string, contents: string | Buffer): void {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

afterEach(() => {
  for (const root of testRoots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Tianwen Desktop B1 artifact audit', () => {
  it('accepts only the fixed B1 application and legal-resource payload', () => {
    const unpackedRoot = createUnpackedRoot()

    expect(() => auditDesktopArtifact(unpackedRoot)).not.toThrow()
  })

  it('rejects a second DSH, pnpm store, source, tests, and Runtime directory', () => {
    const unpackedRoot = createUnpackedRoot()

    for (const forbidden of [
      'resources/app/dist/unknown.js',
      'resources/app/node_modules/@deepseek-ai/dsh/package.json',
      'resources/app/.pnpm/lock.yaml',
      'resources/app/patches/@deepseek-ai__dsh.patch',
      'resources/app/tests/fixture.ts',
      'resources/app/src/main.ts',
    ]) {
      writeFixture(unpackedRoot, forbidden, 'forbidden')
      expect(() => auditDesktopArtifact(unpackedRoot)).toThrow(/forbidden|allowlist/iu)
      rmSync(join(unpackedRoot, forbidden))
    }

    mkdirSync(join(unpackedRoot, 'resources/runtime'), { recursive: true })
    expect(() => auditDesktopArtifact(unpackedRoot)).toThrow(/runtime|forbidden/iu)
  })

  it('rejects an out-of-app payload elsewhere in resources', () => {
    const unpackedRoot = createUnpackedRoot()
    writeFixture(
      unpackedRoot,
      'resources/vendor/node_modules/@deepseek-ai/dsh/package.json',
      'forbidden',
    )

    expect(() => auditDesktopArtifact(unpackedRoot)).toThrow(/forbidden|allowlist/iu)
  })
})

describe('Tianwen Desktop Runtime distribution', () => {
  it('pins preview.6 to the exact embedded Runtime 0.1.5 resource', () => {
    const desktopManifest = JSON.parse(readFileSync(resolve(
      'packages/tianwen-desktop-host/package.json',
    ), 'utf8')) as {
      version: string
      build: { extraResources: Array<{ from: string, to: string }> }
    }
    const desktopRuntimeArchive = desktopManifest.build.extraResources
      .find(({ to }) => to.startsWith('runtime/'))
      ?.to.split('/').at(-1)

    expect(desktopManifest.version).toBe('0.1.0-preview.6')
    expect(desktopRuntimeArchive).toBe('tianwen-runtime-bundle-0.1.5.tgz')
    expect(desktopManifest.build.extraResources).toContainEqual({
      from: 'dist/runtime/tianwen-runtime-bundle-0.1.5.tgz',
      to: 'runtime/tianwen-runtime-bundle-0.1.5.tgz',
    })
  })

  it('rejects a non-absolute, wrongly named, missing, or non-file Runtime source', () => {
    const packageRoot = createTestRoot()
    const sourceRoot = createTestRoot()
    const wrongName = join(sourceRoot, 'runtime.tgz')
    writeFixture(sourceRoot, 'runtime.tgz', 'wrong name')

    expect(() => stageDesktopRuntime('tianwen-runtime-bundle-0.1.5.tgz', packageRoot))
      .toThrow(/absolute/iu)
    expect(() => stageDesktopRuntime(wrongName, packageRoot)).toThrow(/basename|name/iu)
    expect(() => stageDesktopRuntime(
      join(sourceRoot, 'missing', 'tianwen-runtime-bundle-0.1.5.tgz'),
      packageRoot,
    )).toThrow(/missing|file/iu)

    const directorySource = join(sourceRoot, 'directory', 'tianwen-runtime-bundle-0.1.5.tgz')
    mkdirSync(directorySource, { recursive: true })
    expect(() => stageDesktopRuntime(directorySource, packageRoot)).toThrow(/file/iu)
  })

  it('copies the exact Runtime bytes to the fixed Desktop staging path', () => {
    const bytes = Buffer.from([0, 1, 2, 3, 255, 10, 13])
    const source = createRuntimeSource(bytes)
    const packageRoot = createTestRoot()

    const staged = stageDesktopRuntime(source, packageRoot)

    expect(staged).toBe(join(
      packageRoot,
      'dist',
      'runtime',
      'tianwen-runtime-bundle-0.1.5.tgz',
    ))
    expect(readFileSync(staged)).toEqual(bytes)
  })

  it('accepts only the exact B2 application, legal, and Runtime resources', () => {
    const { source, bytes } = createRuntimeArchive(true)
    const unpackedRoot = createUnpackedRoot(bytes)

    expect(() => auditDesktopArtifact(unpackedRoot, source)).not.toThrow()

    writeFixture(
      unpackedRoot,
      'resources/vendor/node_modules/@deepseek-ai/dsh/package.json',
      'forbidden',
    )
    expect(() => auditDesktopArtifact(unpackedRoot, source)).toThrow(/forbidden|allowlist/iu)
    rmSync(join(unpackedRoot, 'resources/vendor'), { recursive: true })

    rmSync(join(unpackedRoot, 'resources/app/dist/profile-prepare.js'))
    expect(() => auditDesktopArtifact(unpackedRoot, source)).toThrow(/missing|allowlist/iu)
  })

  it('rejects a Runtime archive without the Web client artifact', () => {
    const { source, bytes } = createRuntimeArchive(false)
    const unpackedRoot = createUnpackedRoot(bytes)

    expect(() => auditDesktopArtifact(unpackedRoot, source))
      .toThrow(/dist\/client\.js/iu)
  })

  it('rejects a packaged Runtime whose SHA-256 no longer matches the source', () => {
    const bytes = Buffer.from('source Runtime archive bytes')
    const source = createRuntimeSource(bytes)
    const sourceBeforeAudit = readFileSync(source)
    const unpackedRoot = createUnpackedRoot(bytes)

    const packaged = join(
      unpackedRoot,
      'resources',
      'runtime',
      'tianwen-runtime-bundle-0.1.5.tgz',
    )
    appendFileSync(packaged, 'changed')

    expect(() => auditDesktopArtifact(unpackedRoot, source)).toThrow(/SHA-256|digest/iu)
    expect(readFileSync(source)).toEqual(sourceBeforeAudit)
  })
})
