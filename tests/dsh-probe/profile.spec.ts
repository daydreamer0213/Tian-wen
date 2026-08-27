import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('Tianwen DSH Bundle', () => {
  it('declares one distributable bundle patch', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(
        root,
        'packages/tianwen-dsh-probe-bundle/package.json',
      ), 'utf8'),
    ) as {
      name: string
      dsh: { bundle: { patch: string } }
      files: string[]
    }
    expect(manifest.name).toBe('@tianwen/dsh-probe-bundle')
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.files).toContain('cordis.patch.yml')
    expect(manifest.files).toContain('dist')
  })

  it('overrides the default route and inserts the Tianwen adapter', () => {
    const patch = readFileSync(
      resolve(
        root,
        'packages/tianwen-dsh-probe-bundle/cordis.patch.yml',
      ),
      'utf8',
    )
    expect(patch).toContain('id: agent-default-model')
    expect(patch).toContain('provider: tianwen-probe')
    expect(patch).toContain('model: scripted')
    expect(patch).toContain("name: '@tianwen/dsh-probe-bundle/adapter'")
  })

  it('rejects a missing disposable profile root before doing work', () => {
    const result = spawnSync(
      process.execPath,
      [resolve(root, 'scripts/verify-dsh-profile.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
        env: {},
        shell: false,
      },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('TIANWEN_DSH_PROBE_ROOT is required')
  })

  it.runIf(process.platform === 'win32')(
    'rejects a Windows profile root outside the D drive data boundary',
    () => {
      const result = spawnSync(
        process.execPath,
        [resolve(root, 'scripts/verify-dsh-profile.mjs')],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            TIANWEN_DSH_PROBE_ROOT: 'C:\\outside-probe',
          },
          shell: false,
        },
      )
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        'must be a child of D:\\DevData',
      )
    },
  )

  it.runIf(process.platform === 'win32')(
    'rejects the D drive data root and a traversal back to it',
    () => {
      for (const probeRoot of [
        'D:\\DevData',
        'D:\\DevData\\tianwen-dsh-rc2-spike\\..',
      ]) {
        const result = spawnSync(
          process.execPath,
          [resolve(root, 'scripts/verify-dsh-profile.mjs')],
          {
            cwd: root,
            encoding: 'utf8',
            env: { TIANWEN_DSH_PROBE_ROOT: probeRoot },
            shell: false,
          },
        )
        expect(result.status).toBe(1)
        expect(result.stderr).toContain('must be a child of D:\\DevData')
      }
    },
  )

  it.runIf(process.platform === 'win32')(
    'rejects a D drive child whose real path escapes the data root',
    () => {
      const parent = `D:\\DevData\\tianwen-profile-root-test-${randomUUID()}`
      const probeRoot = `${parent}\\escaped`
      mkdirSync(parent)
      symlinkSync('C:\\Windows\\Temp', probeRoot, 'junction')
      try {
        const result = spawnSync(
          process.execPath,
          [resolve(root, 'scripts/verify-dsh-profile.mjs')],
          {
            cwd: root,
            encoding: 'utf8',
            env: { TIANWEN_DSH_PROBE_ROOT: probeRoot },
            shell: false,
          },
        )
        expect(result.status).toBe(1)
        expect(result.stderr).toContain(
          'real path must be a child of D:\\DevData',
        )
      } finally {
        unlinkSync(probeRoot)
        rmSync(parent, { recursive: true, force: true })
      }
    },
  )

  it('enforces the fixed Windows install exception and reports both shell layers', async () => {
    const verifier = await import('../../scripts/verify-dsh-profile.mjs')
    expect(verifier.validateFixedInstallBoundary).toBeTypeOf('function')

    const probeRoot = 'D:\\DevData\\tianwen-dsh-rc2-spike\\profile-contract'
    const tarballPath = `${probeRoot}\\packs\\tianwen-dsh-probe-bundle-0.0.0.tgz`
    const values = {
      platform: 'win32',
      probeRoot,
      realProbeRoot: probeRoot,
      profileName: 'tianwen-probe',
      tarballPath,
      realTarballPath: tarballPath,
      producedByCurrentRun: true,
      upstreamArgs: ['add', '--offline', tarballPath],
    } as const

    expect(verifier.validateFixedInstallBoundary(values)).toEqual({
      tianwenOuterShell: false,
      upstreamDshWindowsPluginInstallShell: true,
      scope: 'fixed-offline-profile-install-only',
      userOrModelControlledArguments: false,
    })
    expect(() => verifier.validateFixedInstallBoundary({
      ...values,
      realProbeRoot: `${probeRoot}\\child`,
    })).toThrow()
    expect(() => verifier.validateFixedInstallBoundary({
      ...values,
      producedByCurrentRun: false,
    })).toThrow()
    expect(() => verifier.validateFixedInstallBoundary({
      ...values,
      upstreamArgs: ['add', '--offline', `${tarballPath}&whoami`],
    })).toThrow()
  })

  it('parses only the two authorized Bundle patch operations', async () => {
    const verifier = await import('../../scripts/verify-dsh-profile.mjs')
    expect(verifier.parseAuthoredPatch).toBeTypeOf('function')
    const patch = readFileSync(
      resolve(
        root,
        'packages/tianwen-dsh-probe-bundle/cordis.patch.yml',
      ),
      'utf8',
    )

    expect(verifier.parseAuthoredPatch(patch)).toEqual({
      defaultModel: {
        provider: 'tianwen-probe',
        model: 'scripted',
      },
      insertedAdapter: {
        id: 'tianwen-probe-adapter',
        name: '@tianwen/dsh-probe-bundle/adapter',
      },
    })
    expect(() => verifier.parseAuthoredPatch(`${patch}
- id: goal
  config:
    objective: replaced
`)).toThrow()
  })

  it('binds the scripted route to the dumped agent-default-model row', async () => {
    const verifier = await import('../../scripts/verify-dsh-profile.mjs')
    expect(verifier.parseDumpedDefaultModel).toBeTypeOf('function')
    const validDump = [
      '# == @deepseek-ai/dsh-base, patched by @tianwen/dsh-probe-bundle',
      '- id: agent-default-model',
      "  name: '@deepseek-ai/dsh-agent-default-model'",
      '  config:',
      '    provider: tianwen-probe',
      '    model: scripted',
      '- id: unrelated',
      "  name: '@example/unrelated'",
      '',
    ].join('\n')
    expect(verifier.parseDumpedDefaultModel(validDump)).toEqual({
      id: 'agent-default-model',
      name: '@deepseek-ai/dsh-agent-default-model',
      provider: 'tianwen-probe',
      model: 'scripted',
    })

    const misplacedRoute = validDump
      .replace('    provider: tianwen-probe', '    provider: wrong')
      .replace('    model: scripted', '    model: wrong')
      .concat([
        '- id: misleading',
        '  config:',
        '    provider: tianwen-probe',
        '    model: scripted',
        '',
      ].join('\n'))
    expect(() => verifier.parseDumpedDefaultModel(misplacedRoute)).toThrow()
  })

  it('resolves and imports both public Bundle exports from a package anchor', async () => {
    const verifier = await import('../../scripts/verify-dsh-profile.mjs')
    expect(verifier.resolveAndImportBundleExports).toBeTypeOf('function')
    const evidence = await verifier.resolveAndImportBundleExports(resolve(
      root,
      'packages/tianwen-dsh-probe-bundle/package.json',
    ))
    expect(evidence).toMatchObject({
      rootSpecifier: '@tianwen/dsh-probe-bundle',
      rootIdentity: 'tianwen-probe',
      rootApply: 'function',
      adapterSpecifier: '@tianwen/dsh-probe-bundle/adapter',
      adapterName: 'tianwen-probe-adapter',
      adapterInject: ['llm'],
      adapterApply: 'function',
    })
    expect(evidence.rootResolved).toMatch(/dist[\\/]index\.js$/u)
    expect(evidence.adapterResolved).toMatch(/dist[\\/]adapter\.js$/u)
  })
})
