import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DESKTOP_WINDOW_OPTIONS,
  createDesktopShutdownCoordinator,
  desktopNavigationAllowed,
  parseDesktopArgs,
  resolveDesktopBaseTarget,
  resolveKnownOldDesktopTarget,
  resolveDesktopTarget,
  startDesktopWebHost,
} from '../../packages/tianwen-desktop-host/src/host.js'

const fixtureRoot = resolve(
  process.env.TIANWEN_FILE_TEST_ROOT ?? join(tmpdir(), 'tianwen-file-tests'),
  'desktop-host',
)
const dshVersion = '0.1.1-rc.2'
const runtimePackage = '@tianwen/runtime-bundle'
const runtimeVersion = '0.1.24'
const fixtures: string[] = []

interface FakeChild extends EventEmitter {
  pid: number
  stdout: PassThrough
  stderr: PassThrough
  kill: () => boolean
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`, 'utf8')
}

function fixture(): { nodeExecutable: string, dshRoot: string, dshHome: string } {
  const root = join(fixtureRoot, randomUUID())
  fixtures.push(root)
  const dshRoot = join(root, 'dsh')
  const dshHome = join(root, 'home')
  mkdirSync(join(dshRoot, 'lib'), { recursive: true })
  mkdirSync(join(dshHome, 'profiles', 'web'), { recursive: true })
  writeFileSync(join(dshRoot, 'lib', 'bin.js'), 'export {}\n', 'utf8')
  writeJson(join(dshRoot, 'package.json'), {
    name: '@deepseek-ai/dsh', version: dshVersion, bin: { dsh: 'lib/bin.js' },
  })
  writeJson(join(dshHome, 'profiles', 'web', 'package.json'), {
    name: '@tianwen/web-profile',
    dsh: { profile: { bundles: ['@tianwen/runtime-bundle'] } },
    dependencies: { '@tianwen/runtime-bundle': runtimeVersion },
  })
  writeJson(join(dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
    name: '@tianwen/runtime-bundle', version: runtimeVersion,
  })
  return { nodeExecutable: process.execPath, dshRoot, dshHome }
}

function child(exitsOnKill = true): FakeChild {
  const result = new EventEmitter() as FakeChild
  result.pid = 4321
  result.stdout = new PassThrough()
  result.stderr = new PassThrough()
  result.kill = () => {
    if (exitsOnKill) queueMicrotask(() => result.emit('exit', 0, null))
    return true
  }
  return result
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return
    await new Promise<void>(resolveWait => { setImmediate(resolveWait) })
  }
  throw new Error('condition did not become true')
}

afterEach(() => {
  while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true })
})

describe('Tianwen Desktop Web host contract', () => {
  it('exposes a sandboxed window boundary that accepts only the ready origin', () => {
    const readyUrl = new URL('http://127.0.0.1:3210/')
    expect(DESKTOP_WINDOW_OPTIONS.webPreferences).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
    expect(desktopNavigationAllowed('http://127.0.0.1:3210/path', readyUrl)).toBe(true)
    expect(desktopNavigationAllowed('http://127.0.0.1:3211/', readyUrl)).toBe(false)
    expect(desktopNavigationAllowed('https://example.com/', readyUrl)).toBe(false)
  })

  it('coordinates concurrent shutdown calls and exits after the owned host stops', async () => {
    let stops = 0
    const exits: number[] = []
    const reports: string[] = []
    const shutdown = createDesktopShutdownCoordinator({
      stop: async () => { stops += 1 },
      exit: code => { exits.push(code) },
      report: message => { reports.push(message) },
    })
    await Promise.all([shutdown(), shutdown()])
    expect(stops).toBe(1)
    expect(exits).toEqual([0])
    expect(reports).toEqual([])
  })

  it('reports a shutdown failure and exits nonzero', async () => {
    const exits: number[] = []
    const reports: string[] = []
    const shutdown = createDesktopShutdownCoordinator({
      stop: async () => { throw new Error('stop failed') },
      exit: code => { exits.push(code) },
      report: message => { reports.push(message) },
    })
    await shutdown()
    expect(exits).toEqual([1])
    expect(reports).toEqual(['Tianwen Desktop failed to stop: stop failed'])
  })

  it('resolves only the fixed installed DSH and Web Profile layout', () => {
    const input = fixture()
    expect(resolveDesktopTarget(input)).toMatchObject({
      nodeExecutable: realpathSync(input.nodeExecutable),
      dshBin: realpathSync(join(input.dshRoot, 'lib/bin.js')),
      dshHome: realpathSync(input.dshHome),
      profileRoot: realpathSync(join(input.dshHome, 'profiles/web')),
    })
  })

  it('rejects the known old Runtime while accepting only the embedded current Runtime', () => {
    const old = fixture()
    writeJson(join(old.dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.10',
    })
    expect(() => resolveDesktopTarget(old)).toThrow(/required exact package/u)

    expect(resolveDesktopTarget(fixture()).profileRoot).toBeDefined()
  })

  it('recognizes Runtime 0.1.20 as the normal predecessor for one Desktop upgrade', () => {
    const previous020Base = fixture()
    writeJson(join(previous020Base.dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.20',
    })
    const previous020Target = {
      ...previous020Base,
      profileRoot: realpathSync(join(previous020Base.dshHome, 'profiles/web')),
    }

    expect(resolveKnownOldDesktopTarget(previous020Target).profileRoot).toBe(previous020Target.profileRoot)
  })

  it('recognizes Runtime 0.1.21 as the normal predecessor for one Desktop upgrade', () => {
    const previous021Base = fixture()
    writeJson(join(previous021Base.dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.21',
    })
    const previous021Target = {
      ...previous021Base,
      profileRoot: realpathSync(join(previous021Base.dshHome, 'profiles/web')),
    }

    expect(resolveKnownOldDesktopTarget(previous021Target).profileRoot).toBe(previous021Target.profileRoot)
  })

  it('recognizes Runtime 0.1.22 as the normal predecessor for one Desktop upgrade', () => {
    const previous022Base = fixture()
    writeJson(join(previous022Base.dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version: '0.1.22',
    })
    const previous022Target = {
      ...previous022Base,
      profileRoot: realpathSync(join(previous022Base.dshHome, 'profiles/web')),
    }

    expect(resolveKnownOldDesktopTarget(previous022Target).profileRoot).toBe(previous022Target.profileRoot)
  })

  it.each(['0.1.23', '0.1.19', '0.1.18', '0.1.17', '0.1.16', '0.1.15', '0.1.14', '0.1.13', '0.1.12', '0.1.11', '0.1.10'])('recognizes the exact supported old Runtime %s for one Desktop upgrade', version => {
    const old = fixture()
    writeJson(join(old.dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version,
    })

    expect(resolveKnownOldDesktopTarget(old).profileRoot).toBe(realpathSync(join(old.dshHome, 'profiles/web')))
  })

  it.each(['0.0.9', '0.1.0', '0.1.1', '0.1.2', '0.1.25', 'not-a-version', '9.9.9'])('rejects an unknown or malformed future Runtime version %s', version => {
    const input = fixture()
    writeJson(join(input.dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), {
      name: runtimePackage, version,
    })
    expect(() => resolveDesktopTarget(input)).toThrow(/required exact package/u)
  })

  it('resolves a compatible external DSH before its Web Profile exists', () => {
    const input = fixture()
    rmSync(join(input.dshHome, 'profiles', 'web'), { recursive: true })
    expect(resolveDesktopBaseTarget(input)).toMatchObject({
      nodeExecutable: realpathSync(input.nodeExecutable),
      dshRoot: realpathSync(input.dshRoot),
      dshHome: realpathSync(input.dshHome),
      dshBin: realpathSync(join(input.dshRoot, 'lib/bin.js')),
    })
    expect(() => resolveDesktopTarget(input)).toThrow(/Web Profile is missing/u)
  })

  it('does not weaken exact DSH validation for a base target', () => {
    const input = fixture()
    writeJson(join(input.dshRoot, 'package.json'), {
      name: '@deepseek-ai/dsh', version: '0.1.1', bin: { dsh: 'lib/bin.js' },
    })
    expect(() => resolveDesktopBaseTarget(input)).toThrow(/required exact package/u)
  })

  it('accepts a non-empty Runtime package spec declared by DSH', () => {
    const input = fixture()
    writeJson(join(input.dshHome, 'profiles', 'web', 'package.json'), {
      dsh: { profile: { bundles: [runtimePackage] } },
      dependencies: { [runtimePackage]: 'file:D:/packs/tianwen-runtime-bundle-0.1.24.tgz' },
    })
    expect(resolveDesktopTarget(input).profileRoot).toBe(realpathSync(join(input.dshHome, 'profiles', 'web')))
  })

  it.each([
    ['missing', {}],
    ['null', { [runtimePackage]: null }],
    ['object', { [runtimePackage]: { version: runtimeVersion } }],
    ['array', { [runtimePackage]: [runtimeVersion] }],
    ['empty string', { [runtimePackage]: '' }],
  ])('rejects a %s Runtime dependency declaration', (_label, dependencies) => {
    const input = fixture()
    writeJson(join(input.dshHome, 'profiles', 'web', 'package.json'), {
      dsh: { profile: { bundles: [runtimePackage] } }, dependencies,
    })
    expect(() => resolveDesktopTarget(input)).toThrow()
  })

  it.each([
    ['relative paths', (input: ReturnType<typeof fixture>) => ({ ...input, dshRoot: 'relative' })],
    ['non-Node executable', (input: ReturnType<typeof fixture>) => ({ ...input, nodeExecutable: process.env.ComSpec! })],
    ['wrong DSH version', (input: ReturnType<typeof fixture>) => {
      writeJson(join(input.dshRoot, 'package.json'), { name: '@deepseek-ai/dsh', version: '0.1.1', bin: { dsh: 'lib/bin.js' } })
      return input
    }],
    ['an alternate DSH entry point', (input: ReturnType<typeof fixture>) => {
      writeFileSync(join(input.dshRoot, 'lib', 'alternate.js'), 'export {}\n', 'utf8')
      writeJson(join(input.dshRoot, 'package.json'), { name: '@deepseek-ai/dsh', version: dshVersion, bin: { dsh: 'lib/alternate.js' } })
      return input
    }],
    ['escaping bin.dsh', (input: ReturnType<typeof fixture>) => {
      writeJson(join(input.dshRoot, 'package.json'), { name: '@deepseek-ai/dsh', version: dshVersion, bin: { dsh: '../cli.js' } })
      return input
    }],
    ['missing Web Profile', (input: ReturnType<typeof fixture>) => {
      rmSync(join(input.dshHome, 'profiles', 'web'), { recursive: true })
      return input
    }],
    ['missing Runtime bundle declaration', (input: ReturnType<typeof fixture>) => {
      writeJson(join(input.dshHome, 'profiles', 'web', 'package.json'), { dsh: { profile: { bundles: [] } }, dependencies: {} })
      return input
    }],
    ['duplicate Runtime bundle declaration', (input: ReturnType<typeof fixture>) => {
      writeJson(join(input.dshHome, 'profiles', 'web', 'package.json'), { dsh: { profile: { bundles: ['@tianwen/runtime-bundle', '@tianwen/runtime-bundle'] } }, dependencies: { '@tianwen/runtime-bundle': runtimeVersion } })
      return input
    }],
    ['wrong Runtime version', (input: ReturnType<typeof fixture>) => {
      writeJson(join(input.dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'), { name: '@tianwen/runtime-bundle', version: '9.9.9' })
      return input
    }],
    ['Runtime directory outside Profile', (input: ReturnType<typeof fixture>) => {
      const outside = join(input.dshHome, 'runtime-outside-profile')
      writeJson(join(outside, 'package.json'), { name: '@tianwen/runtime-bundle', version: runtimeVersion })
      rmSync(join(input.dshHome, 'profiles', 'web', 'node_modules'), { recursive: true })
      mkdirSync(join(input.dshHome, 'profiles', 'web', 'node_modules', '@tianwen'), { recursive: true })
      symlinkSync(outside, join(input.dshHome, 'profiles', 'web', 'node_modules', '@tianwen', 'runtime-bundle'), 'junction')
      return input
    }],
    ['Runtime in bundledDependencies', (input: ReturnType<typeof fixture>) => {
      writeJson(join(input.dshHome, 'profiles', 'web', 'package.json'), {
        dsh: { profile: { bundles: [runtimePackage] } }, dependencies: { [runtimePackage]: runtimeVersion },
        bundledDependencies: [runtimePackage],
      })
      return input
    }],
    ['Runtime in bundleDependencies', (input: ReturnType<typeof fixture>) => {
      writeJson(join(input.dshHome, 'profiles', 'web', 'package.json'), {
        dsh: { profile: { bundles: [runtimePackage] } }, dependencies: { [runtimePackage]: runtimeVersion },
        bundleDependencies: [runtimePackage],
      })
      return input
    }],
    ...['devDependencies', 'optionalDependencies', 'peerDependencies'].map(section => [
      `Runtime in ${section}`,
      (input: ReturnType<typeof fixture>) => {
        writeJson(join(input.dshHome, 'profiles', 'web', 'package.json'), {
          dsh: { profile: { bundles: [runtimePackage] } },
          dependencies: { [runtimePackage]: runtimeVersion },
          [section]: { [runtimePackage]: runtimeVersion },
        })
        return input
      },
    ] as const),
  ])('rejects %s', (_label, change) => {
    expect(() => resolveDesktopTarget(change(fixture()))).toThrow()
  })

  it('accepts one exact value for every command argument', () => {
    const input = fixture()
    expect(parseDesktopArgs(['--node', input.nodeExecutable, '--dsh-root', input.dshRoot, '--dsh-home', input.dshHome])).toEqual(input)
    expect(() => parseDesktopArgs(['--node', input.nodeExecutable, '--node', input.nodeExecutable, '--dsh-root', input.dshRoot, '--dsh-home', input.dshHome])).toThrow()
    expect(() => parseDesktopArgs(['--node', input.nodeExecutable, '--dsh-root', input.dshRoot, '--dsh-home', input.dshHome, 'extra'])).toThrow()
  })

  it('starts DSH Web with the fixed loopback command and environment', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    let spawned: unknown
    const hostPromise = startDesktopWebHost(target, { spawn: ((program, args, options) => {
      spawned = { program, args, options }
      queueMicrotask(() => fake.stdout.write('ready http://127.0.0.1:4312/\n'))
      return fake
    }) as never })
    const host = await hostPromise
    expect(spawned).toEqual({
      program: target.nodeExecutable,
      args: [target.dshBin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'],
      options: expect.objectContaining({ shell: false, windowsHide: true }),
    })
    expect((spawned as { options: { env: NodeJS.ProcessEnv } }).options.env).toMatchObject({
      ...process.env, DSH_HOME: target.dshHome, DSH_TELEMETRY_DISABLED: '1',
      TIANWEN_LEARNING_LOOP_ROOT: join(target.dshHome, '..', 'state', 'learning-loop'),
    })
    expect(host.url.href).toBe('http://127.0.0.1:4312/')
    await host.stop()
  })

  it('passes a verified native observation overlay to Web and owns its cleanup', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    const patchPath = join(fixtureRoot, 'owned-observation.patch.yml')
    const cleanups: string[] = []
    let spawned: unknown
    const hostPromise = startDesktopWebHost(target, {
      prepareObservation: async (_preparedTarget, environment) => ({
        patchPath,
        status: { kind: 'observed' },
        verify: async () => environment.DSH_HOME === target.dshHome,
        cleanup: async () => { cleanups.push(patchPath) },
      }),
      spawn: ((program, args, options) => {
        spawned = { program, args, options }
        queueMicrotask(() => fake.stdout.write('ready http://127.0.0.1:4317/\n'))
        return fake
      }) as never,
    })

    const host = await hostPromise
    expect(spawned).toEqual({
      program: target.nodeExecutable,
      args: [
        target.dshBin,
        'web',
        '--patch',
        patchPath,
        '--host',
        '127.0.0.1',
        '--port',
        '0',
        '--no-open',
      ],
      options: expect.objectContaining({ shell: false, windowsHide: true }),
    })
    expect(host.observation).toEqual({ kind: 'observed' })
    expect(cleanups).toEqual([])
    await host.stop()
    expect(cleanups).toEqual([patchPath])
  })

  it('falls back to the unchanged stock Web command when bound observation sources drift', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    const cleanups: string[] = []
    let spawnedArgs: readonly string[] | undefined
    const host = await startDesktopWebHost(target, {
      prepareObservation: async () => ({
        patchPath: join(fixtureRoot, 'drifted.patch.yml'),
        status: { kind: 'observed' },
        verify: async () => false,
        cleanup: async () => { cleanups.push('cleaned') },
      }),
      spawn: ((_program, args) => {
        spawnedArgs = args
        queueMicrotask(() => fake.stdout.write('ready http://127.0.0.1:4318/\n'))
        return fake
      }) as never,
    })

    expect(spawnedArgs).toEqual([
      target.dshBin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open',
    ])
    expect(host.observation).toEqual({ kind: 'stock', reason: 'observation-unavailable' })
    expect(cleanups).toEqual(['cleaned'])
    await host.stop()
    expect(cleanups).toEqual(['cleaned', 'cleaned'])
  })

  it('still starts stock Web when cleanup of a drifted observation overlay rejects', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    let spawnedArgs: readonly string[] | undefined
    const host = await startDesktopWebHost(target, {
      prepareObservation: async () => ({
        patchPath: join(fixtureRoot, 'uncleanable-drifted.patch.yml'),
        status: { kind: 'observed' },
        verify: async () => false,
        cleanup: async () => { throw new Error('fixture cleanup refusal') },
      }),
      spawn: ((_program, args) => {
        spawnedArgs = args
        queueMicrotask(() => fake.stdout.write('ready http://127.0.0.1:4321/\n'))
        return fake
      }) as never,
    })

    expect(spawnedArgs).toEqual([
      target.dshBin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open',
    ])
    expect(host.observation).toEqual({ kind: 'stock', reason: 'observation-unavailable' })
    await host.stop()
  })

  it.each(['throw', 'missing-pipes'])('cleans an observed overlay when process startup fails: %s', async scenario => {
    const target = resolveDesktopTarget(fixture())
    const cleanups: string[] = []
    const fake = child()
    if (scenario === 'missing-pipes') fake.stdout = null as never
    const pending = startDesktopWebHost(target, {
      prepareObservation: async () => ({
        patchPath: join(fixtureRoot, 'startup-failure.patch.yml'),
        status: { kind: 'observed' },
        verify: async () => true,
        cleanup: async () => { cleanups.push('cleaned') },
      }),
      spawn: (() => {
        if (scenario === 'throw') throw new Error('spawn failed')
        return fake
      }) as never,
    })

    await expect(pending).rejects.toThrow()
    expect(cleanups).toEqual(['cleaned'])
  })

  it('rejects a skipped native name guard and cleans before exposing a host', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    const cleanups: string[] = []
    const pending = startDesktopWebHost(target, {
      prepareObservation: async () => ({
        patchPath: join(fixtureRoot, 'guarded.patch.yml'),
        status: { kind: 'observed' },
        verify: async () => true,
        cleanup: async () => { cleanups.push('cleaned') },
      }),
      spawn: (() => {
        queueMicrotask(() => {
          fake.stderr.write('patch: name mismatch for "tools" (expected "custom", got "@deepseek-ai/dsh-tools"), skipping\n')
          fake.stdout.write('ready http://127.0.0.1:4319/\n')
        })
        return fake
      }) as never,
    })

    await expect(pending).rejects.toThrow(/rejected the native observation overlay/u)
    expect(cleanups).toEqual(['cleaned'])
  })

  it('keeps the overlay until a normally exited child has released it', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    const cleanups: string[] = []
    const host = await startDesktopWebHost(target, {
      prepareObservation: async () => ({
        patchPath: join(fixtureRoot, 'until-exit.patch.yml'),
        status: { kind: 'observed' },
        verify: async () => true,
        cleanup: async () => { cleanups.push('cleaned') },
      }),
      spawn: (() => {
        queueMicrotask(() => fake.stdout.write('ready http://127.0.0.1:4320/\n'))
        return fake
      }) as never,
    })
    expect(cleanups).toEqual([])

    fake.emit('exit', 0, null)
    await host.exited

    expect(cleanups).toEqual(['cleaned'])
  })

  it('ignores unrelated external URLs before the loopback readiness URL', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    const pending = startDesktopWebHost(target, { spawn: (() => {
      queueMicrotask(() => {
        fake.stderr.write('Learn more at https://example.com/docs\n')
        fake.stdout.write('ready http://127.0.0.1:4316/\n')
      })
      return fake
    }) as never })

    const host = await pending
    expect(host.url.href).toBe('http://127.0.0.1:4316/')
    await host.stop()
  })

  it.each(['https://example.com/', 'file:///C:/secret', 'data:text/plain,nope'])('does not accept a non-loopback URL as readiness', async url => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    const pending = startDesktopWebHost(target, { spawn: (() => {
      queueMicrotask(() => {
        fake.stdout.write(`${url}\n`)
        fake.emit('exit', 1, null)
      })
      return fake
    }) as never })
    await expect(pending).rejects.toThrow(/exited before readiness/u)
  })

  it('rejects when the child exits before readiness', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    const pending = startDesktopWebHost(target, { spawn: (() => {
      queueMicrotask(() => fake.emit('exit', 1, null))
      return fake
    }) as never })
    await expect(pending).rejects.toThrow()
  })

  it('rejects after the injected 120-second readiness timeout', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    let fire: (() => void) | undefined
    const pending = startDesktopWebHost(target, {
      spawn: (() => fake) as never,
      setTimeout: ((handler: () => void) => {
        fire = handler
        return 1
      }) as never,
      clearTimeout: (() => undefined) as never,
    })
    await waitFor(() => fire !== undefined)
    fire!()
    await expect(pending).rejects.toThrow(/120/u)
  })

  it.each([
    ['timeout', (fake: FakeChild, fire: (delay: number) => void) => fire(120_000)],
    ['overflow', (fake: FakeChild) => fake.stderr.write(Buffer.alloc(65_537))],
  ])('cleans up an owned child before rejecting startup %s', async (_label, trigger) => {
    const target = resolveDesktopTarget(fixture())
    const fake = child(false)
    let nextTimer = 0
    const timers = new Map<number, { delay: number, handler: () => void }>()
    const cleared: number[] = []
    let fallbackCalls = 0
    const pending = startDesktopWebHost(target, {
      spawn: (() => fake) as never,
      stopTree: async () => { fallbackCalls += 1 },
      setTimeout: ((handler: () => void, delay: number) => {
        const id = nextTimer += 1
        timers.set(id, { delay, handler })
        return id
      }) as never,
      clearTimeout: ((id: number) => { cleared.push(id) }) as never,
    })
    const fire = (delay: number): void => {
      const timer = [...timers.values()].find(candidate => candidate.delay === delay)
      if (timer === undefined) throw new Error(`missing ${delay}ms timer`)
      timer.handler()
    }
    await waitFor(() => [...timers.values()].some(timer => timer.delay === 120_000))
    trigger(fake, fire)
    let rejected = false
    void pending.catch(() => { rejected = true })
    await Promise.resolve()
    expect(rejected).toBe(false)
    expect(fallbackCalls).toBe(0)
    await waitFor(() => [...timers.values()].some(timer => timer.delay === 5_000))
    fire(5_000)
    await expect(pending).rejects.toThrow()
    expect(fallbackCalls).toBe(1)
    const gracefulTimer = [...timers.entries()].find(([, timer]) => timer.delay === 5_000)?.[0]
    expect(cleared).toContain(gracefulTimer!)
  })

  it('rejects more than 64 KiB before readiness', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    const pending = startDesktopWebHost(target, { spawn: (() => {
      queueMicrotask(() => fake.stderr.write(Buffer.alloc(65_537)))
      return fake
    }) as never })
    await expect(pending).rejects.toThrow(/64/u)
  })

  it('shares one stop operation between concurrent callers', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    let kills = 0
    fake.kill = () => {
      kills += 1
      queueMicrotask(() => fake.emit('exit', 0, null))
      return true
    }
    const host = await startDesktopWebHost(target, { spawn: (() => {
      queueMicrotask(() => fake.stdout.write('http://127.0.0.1:4313/\n'))
      return fake
    }) as never })
    await Promise.all([host.stop(), host.stop()])
    expect(kills).toBe(1)
  })

  it('clears the graceful-stop timer when the child exits first', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child()
    let nextTimer = 0
    const timers = new Map<number, { delay: number, handler: () => void }>()
    const cleared: number[] = []
    const host = await startDesktopWebHost(target, {
      spawn: (() => {
        queueMicrotask(() => fake.stdout.write('http://127.0.0.1:4314/\n'))
        return fake
      }) as never,
      setTimeout: ((handler: () => void, delay: number) => {
        const id = nextTimer += 1
        timers.set(id, { delay, handler })
        return id
      }) as never,
      clearTimeout: ((id: number) => { cleared.push(id) }) as never,
    })
    await host.stop()
    const gracefulTimer = [...timers.entries()].find(([, timer]) => timer.delay === 5_000)?.[0]
    expect(gracefulTimer).toBeDefined()
    expect(cleared).toContain(gracefulTimer!)
  })

  it('uses the fallback once when normal stop outlives its grace period', async () => {
    const target = resolveDesktopTarget(fixture())
    const fake = child(false)
    let nextTimer = 0
    const timers = new Map<number, { delay: number, handler: () => void }>()
    let fallbackCalls = 0
    const host = await startDesktopWebHost(target, {
      spawn: (() => {
        queueMicrotask(() => fake.stdout.write('http://127.0.0.1:4315/\n'))
        return fake
      }) as never,
      stopTree: async () => { fallbackCalls += 1 },
      setTimeout: ((handler: () => void, delay: number) => {
        const id = nextTimer += 1
        timers.set(id, { delay, handler })
        return id
      }) as never,
      clearTimeout: (() => undefined) as never,
    })
    const stopped = host.stop()
    const gracefulTimer = [...timers.values()].find(timer => timer.delay === 5_000)
    if (gracefulTimer === undefined) throw new Error('missing graceful stop timer')
    gracefulTimer.handler()
    await stopped
    expect(fallbackCalls).toBe(1)
  })
})
