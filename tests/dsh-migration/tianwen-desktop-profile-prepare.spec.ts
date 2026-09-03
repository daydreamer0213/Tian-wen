import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDesktopBaseTarget, resolveDesktopTarget } from '../../packages/tianwen-desktop-host/src/host.js'
import type { DesktopBaseTarget } from '../../packages/tianwen-desktop-host/src/host.js'
import {
  ProfilePreparationError,
  inspectWebProfile,
  prepareMissingWebProfile,
  renderManualPreparationCommand,
  resolvePreparedDesktopTarget,
  updateOutdatedWebProfile,
} from '../../packages/tianwen-desktop-host/src/profile-prepare.js'

const fixtureRoot = resolve('D:/DevData/tianwen-desktop-profile-prepare-tests')
const runtimePackage = '@tianwen/runtime-bundle'
const runtimeVersion = '0.1.11'
const fixtures: string[] = []

interface FakeChild extends EventEmitter {
  stdout: PassThrough
  stderr: PassThrough
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`, 'utf8')
}

function fixture(): DesktopBaseTarget {
  const root = join(fixtureRoot, randomUUID())
  fixtures.push(root)
  const dshRoot = join(root, 'dsh')
  const dshHome = join(root, 'home')
  mkdirSync(join(dshRoot, 'lib'), { recursive: true })
  mkdirSync(join(dshHome, 'profiles', 'web'), { recursive: true })
  writeFileSync(join(dshRoot, 'lib', 'bin.js'), 'export {}\n', 'utf8')
  writeJson(join(dshRoot, 'package.json'), {
    name: '@deepseek-ai/dsh', version: '0.1.1-rc.2', bin: { dsh: 'lib/bin.js' },
  })
  writeReadyProfile(dshHome)
  return resolveDesktopBaseTarget({ nodeExecutable: process.execPath, dshRoot, dshHome })
}

function profileRoot(target: DesktopBaseTarget): string {
  return join(target.dshHome, 'profiles', 'web')
}

function writeReadyProfile(dshHome: string): void {
  writeJson(join(dshHome, 'profiles', 'web', 'package.json'), {
    dsh: { profile: { bundles: [runtimePackage] } },
    dependencies: { [runtimePackage]: runtimeVersion },
  })
  writeJson(join(dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
    name: runtimePackage, version: runtimeVersion,
  })
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  return child
}

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true })
})

describe('Tianwen Desktop Profile preparation boundary', () => {
  it('classifies current, known-old, unknown, missing, plain, and broken Profile entries without mutation', () => {
    const ready = fixture()
    expect(inspectWebProfile(ready)).toEqual({ kind: 'ready', profileRoot: profileRoot(ready) })

    const outdated = fixture()
    writeJson(join(profileRoot(outdated), 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.10',
    })
    expect(inspectWebProfile(outdated)).toEqual({ kind: 'outdated-runtime', profileRoot: profileRoot(outdated) })

    const missing = fixture()
    rmSync(profileRoot(missing), { recursive: true })
    expect(inspectWebProfile(missing)).toEqual({ kind: 'missing-profile', profileRoot: profileRoot(missing) })

    const plain = fixture()
    rmSync(profileRoot(plain), { recursive: true })
    writeJson(join(profileRoot(plain), 'package.json'), { name: '@deepseek-ai/dsh-profile-web' })
    expect(inspectWebProfile(plain)).toEqual({ kind: 'missing-runtime', profileRoot: profileRoot(plain) })

    const incompatible = fixture()
    writeJson(join(profileRoot(incompatible), 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '9.9.9',
    })
    expect(inspectWebProfile(incompatible)).toEqual({
      kind: 'incompatible',
      profileRoot: profileRoot(incompatible),
      reason: 'Invalid Tianwen Desktop target: Runtime manifest is not the required exact package',
    })

    const escaped = fixture()
    const outsideProfile = join(escaped.dshRoot, 'outside-web-profile')
    rmSync(profileRoot(escaped), { recursive: true })
    writeJson(join(outsideProfile, 'package.json'), { name: '@deepseek-ai/dsh-profile-web' })
    symlinkSync(outsideProfile, profileRoot(escaped), 'junction')
    expect(inspectWebProfile(escaped)).toEqual({
      kind: 'incompatible',
      profileRoot: profileRoot(escaped),
      reason: 'Invalid Tianwen Desktop target: Web Profile is missing',
    })

    const broken = fixture()
    rmSync(profileRoot(broken), { recursive: true })
    symlinkSync(join(broken.dshHome, 'missing-target'), profileRoot(broken), 'junction')
    expect(inspectWebProfile(broken)).toMatchObject({
      kind: 'incompatible', profileRoot: profileRoot(broken),
    })
  })

  it('renders the selected DSH home and every path as a pasteable PowerShell literal', () => {
    const target: DesktopBaseTarget = {
      nodeExecutable: "D:\\Program Files\\Node's\\node.exe",
      dshRoot: "D:\\Apps\\Deep Seek",
      dshHome: "D:\\Homes\\Ada's DSH",
      dshBin: "D:\\Apps\\Deep Seek\\lib\\bin's.js",
    }
    expect(renderManualPreparationCommand(target, "D:\\Runtime Packs\\Tianwen's.tgz")).toBe(
      "& { $env:DSH_HOME = 'D:\\Homes\\Ada''s DSH'; & 'D:\\Program Files\\Node''s\\node.exe' 'D:\\Apps\\Deep Seek\\lib\\bin''s.js' 'plugin' '--profile' 'web' '--allow-build=koffi' 'add' 'D:\\Runtime Packs\\Tianwen''s.tgz' }",
    )
  })

  it('spawns the selected DSH command exactly once with the selected home', async () => {
    const target = fixture()
    rmSync(profileRoot(target), { recursive: true })
    const child = fakeChild()
    const calls: unknown[] = []
    const runtimeTarball = 'D:\\Runtime Packs\\tianwen-runtime-bundle-0.1.11.tgz'
    const preparation = prepareMissingWebProfile(target, runtimeTarball, {
      spawn: ((program, args, options) => {
        calls.push({ program, args, options })
        queueMicrotask(() => child.emit('close', 0, null))
        return child
      }) as never,
    })
    await expect(preparation).resolves.toBeUndefined()
    expect(calls).toEqual([{
      program: target.nodeExecutable,
      args: [target.dshBin, 'plugin', '--profile', 'web', '--allow-build=koffi', 'add', runtimeTarball],
      options: expect.objectContaining({ shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }),
    }])
    expect((calls[0] as { options: { env: NodeJS.ProcessEnv } }).options.env).toMatchObject({
      ...process.env, DSH_HOME: target.dshHome, DSH_TELEMETRY_DISABLED: '1',
    })
  })

  it('updates the known-old Runtime exactly once with the embedded tarball and selected home', async () => {
    const target = fixture()
    writeJson(join(profileRoot(target), 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.10',
    })
    writeJson(join(profileRoot(target), 'node_modules', '.modules.yaml'), {
      packageManager: 'pnpm@11.20.0',
      storeDir: 'D:\\DevData\\custom-pnpm-store\\v11',
    })
    const child = fakeChild()
    const calls: unknown[] = []
    const runtimeTarball = 'D:\\Runtime Packs\\tianwen-runtime-bundle-0.1.11.tgz'
    const update = updateOutdatedWebProfile(target, runtimeTarball, {
      spawn: ((program, args, options) => {
        calls.push({ program, args, options })
        queueMicrotask(() => child.emit('close', 0, null))
        return child
      }) as never,
    })
    await expect(update).resolves.toBeUndefined()
    expect(calls).toEqual([{
      program: target.nodeExecutable,
      args: [target.dshBin, 'plugin', '--profile', 'web', '--allow-build=koffi', 'add', runtimeTarball],
      options: expect.objectContaining({ shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }),
    }])
    expect((calls[0] as { options: { env: NodeJS.ProcessEnv } }).options.env).toMatchObject({
      ...process.env,
      DSH_HOME: target.dshHome,
      DSH_TELEMETRY_DISABLED: '1',
      PNPM_CONFIG_STORE_DIR: 'D:\\DevData\\custom-pnpm-store',
    })
  })

  it('rechecks the Profile entry and refuses to spawn for a broken junction', async () => {
    const target = fixture()
    rmSync(profileRoot(target), { recursive: true })
    symlinkSync(join(target.dshHome, 'missing-target'), profileRoot(target), 'junction')
    let spawns = 0
    await expect(prepareMissingWebProfile(target, 'D:\\runtime.tgz', {
      spawn: (() => { spawns += 1; return fakeChild() }) as never,
    })).rejects.toThrow(/already exists/u)
    expect(spawns).toBe(0)
  })

  it('rejects a missing Profile below an external profiles junction before preparation can spawn', async () => {
    const target = fixture()
    const externalProfiles = join(target.dshRoot, 'external-profiles')
    rmSync(join(target.dshHome, 'profiles'), { recursive: true })
    mkdirSync(externalProfiles)
    symlinkSync(externalProfiles, join(target.dshHome, 'profiles'), 'junction')
    expect(inspectWebProfile(target)).toMatchObject({
      kind: 'incompatible', profileRoot: profileRoot(target),
    })
    let spawns = 0
    await expect(prepareMissingWebProfile(target, 'D:\\runtime.tgz', {
      spawn: (() => { spawns += 1; return fakeChild() }) as never,
    })).rejects.toThrow(/Profile|profiles|Web/u)
    expect(spawns).toBe(0)
    expect(existsSync(join(externalProfiles, 'web'))).toBe(false)
  })

  it('pins the missing-Profile DSH home before preparation can spawn', async () => {
    const target = fixture()
    rmSync(profileRoot(target), { recursive: true })
    expect(inspectWebProfile(target)).toEqual({ kind: 'missing-profile', profileRoot: profileRoot(target) })
    const externalHome = join(target.dshRoot, 'external-home')
    rmSync(target.dshHome, { recursive: true })
    mkdirSync(externalHome)
    symlinkSync(externalHome, target.dshHome, 'junction')
    let spawns = 0
    await expect(prepareMissingWebProfile(target, 'D:\\runtime.tgz', {
      spawn: (() => {
        spawns += 1
        const child = fakeChild()
        queueMicrotask(() => child.emit('close', 0, null))
        return child
      }) as never,
    })).rejects.toThrow(/DSH home|Profile parent/u)
    expect(spawns).toBe(0)
    expect(existsSync(join(externalHome, 'profiles', 'web'))).toBe(false)
  })

  it.each([
    { label: 'nonzero exit', code: 7, signal: null, expectedExitCode: 7 },
    { label: 'signal exit', code: null, signal: 'SIGTERM', expectedExitCode: null },
  ] as const)('preserves complete stderr for a $label', async ({ code, signal, expectedExitCode }) => {
    const target = fixture()
    rmSync(profileRoot(target), { recursive: true })
    const child = fakeChild()
    const preparation = prepareMissingWebProfile(target, 'D:\\runtime.tgz', {
      spawn: (() => {
        queueMicrotask(() => {
          child.stderr.write('first line\n')
          child.stderr.end('last line\n')
          child.emit('close', code, signal)
        })
        return child
      }) as never,
    })
    const failure = await preparation.catch(error => error)
    expect(failure).toBeInstanceOf(ProfilePreparationError)
    expect(failure).toMatchObject({
      stage: 'dsh-plugin-add', exitCode: expectedExitCode,
      profileRoot: profileRoot(target), stderr: 'first line\nlast line\n',
    })
    expect(failure.message).toContain('stage=dsh-plugin-add')
    expect(failure.message).toContain(`exitCode=${String(expectedExitCode)}`)
    expect(failure.message).toContain(`profileRoot=${profileRoot(target)}`)
    expect(failure.message).toContain('first line\nlast line')
  })

  it('maps a spawn error once without waiting for a later close', async () => {
    const target = fixture()
    rmSync(profileRoot(target), { recursive: true })
    const child = fakeChild()
    const preparation = prepareMissingWebProfile(target, 'D:\\runtime.tgz', {
      spawn: (() => {
        queueMicrotask(() => {
          child.emit('error', new Error('could not spawn DSH'))
          child.emit('close', 9, null)
        })
        return child
      }) as never,
    })
    await expect(preparation).rejects.toMatchObject({
      stage: 'dsh-plugin-add', exitCode: null,
      profileRoot: profileRoot(target), stderr: 'could not spawn DSH',
      message: expect.stringContaining('stage=dsh-plugin-add, exitCode=null'),
    })
  })

  it('strictly validates a ready Profile without interactions or preparation', async () => {
    const target = fixture()
    const calls: string[] = []
    const result = await resolvePreparedDesktopTarget(target, 'D:\\runtime.tgz', {
      confirmCreateProfile: async () => { calls.push('confirm'); return true },
      confirmUpdateRuntime: async () => { calls.push('update-confirm'); return true },
      showManualPreparation: async () => { calls.push('manual') },
    }, {
      inspect: base => { calls.push('inspect'); return inspectWebProfile(base) },
      prepare: async () => { calls.push('prepare') },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })
    expect(result).toEqual(resolveDesktopTarget(target))
    expect(calls).toEqual(['inspect', 'validate'])
  })

  it('shows only the manual command for an existing Profile without Runtime', async () => {
    const target = fixture()
    rmSync(profileRoot(target), { recursive: true })
    writeJson(join(profileRoot(target), 'package.json'), { name: '@deepseek-ai/dsh-profile-web' })
    const calls: string[] = []
    const result = await resolvePreparedDesktopTarget(target, 'D:\\Runtime Packs\\runtime.tgz', {
      confirmCreateProfile: async () => { calls.push('confirm'); return true },
      confirmUpdateRuntime: async () => { calls.push('update-confirm'); return true },
      showManualPreparation: async (reason, command) => {
        calls.push('manual')
        expect(reason).toContain(profileRoot(target))
        expect(command).toContain(`$env:DSH_HOME = '${target.dshHome}'`)
      },
    }, {
      prepare: async () => { calls.push('prepare') },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })
    expect(result).toBeUndefined()
    expect(calls).toEqual(['manual'])
  })

  it('throws the original incompatible reason without interaction or preparation', async () => {
    const target = fixture()
    writeJson(join(profileRoot(target), 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '9.9.9',
    })
    const calls: string[] = []
    await expect(resolvePreparedDesktopTarget(target, 'D:\\runtime.tgz', {
      confirmCreateProfile: async () => { calls.push('confirm'); return true },
      confirmUpdateRuntime: async () => { calls.push('update-confirm'); return true },
      showManualPreparation: async () => { calls.push('manual') },
    }, {
      prepare: async () => { calls.push('prepare') },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })).rejects.toThrow('Invalid Tianwen Desktop target: Runtime manifest is not the required exact package')
    expect(calls).toEqual([])
  })

  it('stops after one refused missing-Profile confirmation', async () => {
    const target = fixture()
    rmSync(profileRoot(target), { recursive: true })
    const calls: string[] = []
    const result = await resolvePreparedDesktopTarget(target, 'D:\\runtime.tgz', {
      confirmCreateProfile: async root => { calls.push(`confirm:${root}`); return false },
      confirmUpdateRuntime: async () => { calls.push('update-confirm'); return true },
      showManualPreparation: async () => { calls.push('manual') },
    }, {
      prepare: async () => { calls.push('prepare') },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })
    expect(result).toBeUndefined()
    expect(calls).toEqual([`confirm:${profileRoot(target)}`])
  })

  it('prepares once after acceptance and then performs one strict validation', async () => {
    const target = fixture()
    rmSync(profileRoot(target), { recursive: true })
    const calls: string[] = []
    const result = await resolvePreparedDesktopTarget(target, 'D:\\runtime.tgz', {
      confirmCreateProfile: async () => { calls.push('confirm'); return true },
      confirmUpdateRuntime: async () => { calls.push('update-confirm'); return true },
      showManualPreparation: async () => { calls.push('manual') },
    }, {
      prepare: async base => { calls.push('prepare'); writeReadyProfile(base.dshHome) },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })
    expect(result).toEqual(resolveDesktopTarget(target))
    expect(calls).toEqual(['confirm', 'prepare', 'validate'])
  })

  it('propagates post-validation failure without retrying or deleting the created Profile', async () => {
    const target = fixture()
    rmSync(profileRoot(target), { recursive: true })
    const calls: string[] = []
    await expect(resolvePreparedDesktopTarget(target, 'D:\\runtime.tgz', {
      confirmCreateProfile: async () => { calls.push('confirm'); return true },
      confirmUpdateRuntime: async () => { calls.push('update-confirm'); return true },
      showManualPreparation: async () => { calls.push('manual') },
    }, {
      prepare: async base => {
        calls.push('prepare')
        writeJson(join(profileRoot(base), 'package.json'), { name: 'incomplete-profile' })
      },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })).rejects.toThrow(/Runtime bundle exactly once/u)
    expect(calls).toEqual(['confirm', 'prepare', 'validate'])
    expect(inspectWebProfile(target)).toEqual({ kind: 'missing-runtime', profileRoot: profileRoot(target) })
  })

  it('stops normally without update or validation when the known-old Runtime update is refused', async () => {
    const target = fixture()
    writeJson(join(profileRoot(target), 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.10',
    })
    const calls: string[] = []
    const result = await resolvePreparedDesktopTarget(target, 'D:\\runtime-0.1.11.tgz', {
      confirmCreateProfile: async () => { calls.push('create-confirm'); return true },
      confirmUpdateRuntime: async root => { calls.push(`update-confirm:${root}`); return false },
      showManualPreparation: async () => { calls.push('manual') },
    }, {
      update: async () => { calls.push('update') },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })
    expect(result).toBeUndefined()
    expect(calls).toEqual([`update-confirm:${profileRoot(target)}`])
    expect(inspectWebProfile(target)).toEqual({ kind: 'outdated-runtime', profileRoot: profileRoot(target) })
  })

  it('updates once after acceptance and then strictly validates the current Runtime', async () => {
    const target = fixture()
    writeJson(join(profileRoot(target), 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.10',
    })
    const calls: string[] = []
    const result = await resolvePreparedDesktopTarget(target, 'D:\\runtime-0.1.11.tgz', {
      confirmCreateProfile: async () => { calls.push('create-confirm'); return true },
      confirmUpdateRuntime: async () => { calls.push('update-confirm'); return true },
      showManualPreparation: async () => { calls.push('manual') },
    }, {
      update: async base => {
        calls.push('update')
        writeJson(join(profileRoot(base), 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
          name: runtimePackage, version: runtimeVersion,
        })
      },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })
    expect(result).toEqual(resolveDesktopTarget(target))
    expect(calls).toEqual(['update-confirm', 'update', 'validate'])
  })

  it('preserves one Runtime update failure without validation or retry', async () => {
    const target = fixture()
    writeJson(join(profileRoot(target), 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.10',
    })
    const calls: string[] = []
    const failure = new ProfilePreparationError(12, profileRoot(target), 'update failed')
    await expect(resolvePreparedDesktopTarget(target, 'D:\\runtime-0.1.11.tgz', {
      confirmCreateProfile: async () => { calls.push('create-confirm'); return true },
      confirmUpdateRuntime: async () => { calls.push('update-confirm'); return true },
      showManualPreparation: async () => { calls.push('manual') },
    }, {
      update: async () => { calls.push('update'); throw failure },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })).rejects.toBe(failure)
    expect(calls).toEqual(['update-confirm', 'update'])
  })

  it('does not accept an update unless strict post-update validation sees the current Runtime', async () => {
    const target = fixture()
    writeJson(join(profileRoot(target), 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.10',
    })
    const calls: string[] = []
    await expect(resolvePreparedDesktopTarget(target, 'D:\\runtime-0.1.11.tgz', {
      confirmCreateProfile: async () => { calls.push('create-confirm'); return true },
      confirmUpdateRuntime: async () => { calls.push('update-confirm'); return true },
      showManualPreparation: async () => { calls.push('manual') },
    }, {
      update: async () => { calls.push('update') },
      validate: base => { calls.push('validate'); return resolveDesktopTarget(base) },
    })).rejects.toThrow(/required exact package/u)
    expect(calls).toEqual(['update-confirm', 'update', 'validate'])
  })
})
