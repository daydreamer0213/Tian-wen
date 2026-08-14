import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

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
  it('pins every installed DSH package to rc.6', () => {
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
    expect(report.expectedDshVersion).toBe('0.1.0-rc.6')
    expect(report.installedPackages.length).toBeGreaterThan(10)
    expect(new Set(report.installedPackages.map(item => item.version)))
      .toEqual(new Set(['0.1.0-rc.6']))

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
    expect(libraries.length).toBeGreaterThan(10)
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
        expect(version).toBe('0.1.0-rc.6')
      }
    }
    const command = pnpmVersionCommand()
    expect(() => execFileSync(command.executable, command.args, { cwd: root, shell: false }))
      .not.toThrow()
  })
})
