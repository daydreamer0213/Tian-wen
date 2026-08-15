import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const packageRoot = resolve(root, 'packages/tianwen-runtime-bundle')
const packRoot = 'D:/DevData/tianwen-dsh-migration-phase-1/packs'
const archive = resolve(packRoot, 'tianwen-runtime-bundle-0.0.0.tgz')
const tar = process.platform === 'win32'
  ? resolve(process.env.SystemRoot!, 'System32', 'tar.exe')
  : 'tar'

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

describe('@tianwen/runtime-bundle', () => {
  it('declares one deployable product package and no Tianwen runtime dependency', () => {
    const manifest = json(resolve(packageRoot, 'package.json')) as {
      name: string
      files: string[]
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      exports: Record<string, unknown>
    }
    expect(manifest.name).toBe('@tianwen/runtime-bundle')
    expect(manifest.dependencies).toEqual({ '@deepseek-ai/cordis': '4.0.1' })
    expect(Object.keys(manifest.dependencies)).not.toContainEqual(
      expect.stringMatching(/^@tianwen\//u),
    )
    expect(manifest.devDependencies).toMatchObject({
      '@tianwen/runtime': 'workspace:*',
      esbuild: '0.28.2',
    })
    expect(manifest.exports).toHaveProperty('./runtime')
    expect(manifest.files).toEqual([
      'dist/index.js',
      'dist/index.d.ts',
      'dist/runtime.js',
      'cordis.patch.yml',
    ])
  })

  it('bundles Tianwen code and leaves only Cordis as a package external', () => {
    const source = readFileSync(resolve(packageRoot, 'dist/runtime.js'), 'utf8')
    const metafile = json(resolve(packageRoot, 'dist/runtime.meta.json')) as {
      inputs: Record<string, unknown>
      outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
    }
    const output = Object.entries(metafile.outputs).find(([path]) =>
      path.replaceAll('\\', '/').endsWith('/dist/runtime.js')
      || path.replaceAll('\\', '/').endsWith('dist/runtime.js'))?.[1]
    expect(output).toBeDefined()
    const packageExternals = output!.imports
      .filter(item => item.external === true && !item.path.startsWith('node:'))
      .map(item => item.path)
      .sort()
    expect(packageExternals).toEqual(['@deepseek-ai/cordis'])
    expect(Object.keys(metafile.inputs).some(path =>
      /node_modules[\\/]@deepseek-ai/u.test(path))).toBe(false)
    expect(Object.keys(metafile.inputs).some(path =>
      /scripted-adapter|test-harness|dsh-probe-bundle/u.test(path))).toBe(false)
    expect(source).not.toMatch(/from\s+["']@tianwen\//u)
    expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
    expect(source).not.toContain('@tianwen/dsh-probe-bundle')
  })

  it('packs only the deployable runtime bundle files', () => {
    expect(existsSync(archive)).toBe(true)
    const entries = execFileSync(tar, ['-tzf', archive], {
      encoding: 'utf8',
      shell: false,
    })
      .split(/\r?\n/u)
      .filter(Boolean)
      .sort()
    expect(entries).toEqual([
      'package/cordis.patch.yml',
      'package/dist/index.d.ts',
      'package/dist/index.js',
      'package/dist/runtime.js',
      'package/package.json',
    ])
    expect(entries.some(entry => /(^|\/)src\//u.test(entry))).toBe(false)
    expect(entries.some(entry => /(^|\/)node_modules\//u.test(entry))).toBe(false)
    expect(entries).not.toContain('package/dist/runtime.d.ts')
    expect(entries).not.toContain('package/dist/runtime.meta.json')
    expect(entries.some(entry => entry.includes('@tianwen'))).toBe(false)
    expect(entries.some(entry => /scripted-adapter|dsh-probe-bundle/u.test(entry))).toBe(false)
    expect(entries.some(entry => /@deepseek-ai\/[^/]+\/src\//u.test(entry))).toBe(false)
  })
})
