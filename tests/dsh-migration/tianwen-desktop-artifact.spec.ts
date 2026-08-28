import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditDesktopArtifact } from '../../scripts/audit-desktop-artifact.mjs'

const testRoots: string[] = []

function createUnpackedRoot(): string {
  const root = `D:\\DevData\\tianwen-desktop-artifact-tests\\${crypto.randomUUID()}`
  testRoots.push(root)
  for (const relativePath of [
    'resources/app/dist/bootstrap.js',
    'resources/app/dist/host.js',
    'resources/app/dist/main.js',
    'resources/app/package.json',
    'resources/LICENSE.txt',
    'resources/THIRD_PARTY_NOTICES.md',
  ]) writeFixture(root, relativePath, 'fixture')
  return root
}

function writeFixture(root: string, relativePath: string, contents: string): void {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents, 'utf8')
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
})
