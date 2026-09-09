import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  NativeObservedToolRuntime,
  type NativeToolRegistrationProducer,
} from '../../packages/tianwen-runtime-bundle/src/native-tools-observer.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const load = (name: string) => import(
  /* @vite-ignore */ pathToFileURL(cliRequire.resolve(name)).href
)

type PluginModule = {
  readonly apply: (ctx: any, config?: any) => unknown
  readonly Config?: unknown
  readonly inject?: readonly string[]
  readonly name?: string
}

type NativeModules = {
  readonly cordis: { Context: new () => any }
  readonly tools: { ToolRuntime: new (ctx: any, config?: any) => any }
  readonly scope: { createScope: (ctx: any, key: object) => any }
  readonly systemPrompt: { SystemPrompt: new (ctx: any) => any }
  readonly subprocess: { LocalSubprocessRuntime: new (ctx: any) => any }
  readonly fsSearch: PluginModule
  readonly skill: PluginModule
  readonly pwsh: PluginModule
}

const expectedProducer = {
  fsSearch: {
    package: '@deepseek-ai/dsh-tool-fs-search',
    version: '0.1.1-rc.2',
    adapter: 'tianwen.file-ancillary.v1',
  },
  skill: {
    package: '@deepseek-ai/dsh-tool-skill',
    version: '0.1.1-rc.2',
    adapter: 'tianwen.file-ancillary.v1',
  },
  pwsh: {
    package: '@deepseek-ai/dsh-tool-pwsh',
    version: '0.1.1-rc.2',
    adapter: 'tianwen.file-ancillary.v1',
  },
} as const satisfies Record<string, NativeToolRegistrationProducer>

let native: NativeModules

beforeAll(async () => {
  const [cordis, tools, scope, systemPrompt, subprocess, fsSearch, skill, pwsh] =
    await Promise.all([
      load('@deepseek-ai/cordis'),
      load('@deepseek-ai/dsh-tools'),
      load('@deepseek-ai/dsh-scope'),
      load('@deepseek-ai/dsh-system-prompt'),
      load('@deepseek-ai/dsh-subprocess-local'),
      load('@deepseek-ai/dsh-tool-fs-search'),
      load('@deepseek-ai/dsh-tool-skill'),
      load('@deepseek-ai/dsh-tool-pwsh'),
    ])
  native = { cordis, tools, scope, systemPrompt, subprocess, fsSearch, skill, pwsh } as NativeModules
})

function serializableDeclaration(value: unknown): unknown {
  if (typeof value === 'function') return '[function]'
  if (Array.isArray(value)) return value.map(serializableDeclaration)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    serializableDeclaration(child),
  ]))
}

function functionReferences(definition: any): unknown[] {
  return [
    definition.execute,
    definition.finalizeContent,
    definition.isConcurrencySafe,
    definition.presentCall,
    definition.presentResult,
    definition.output.render,
    definition.output.presentationMeta,
  ]
}

async function createHarness(
  Runtime: new (ctx: any, config?: any) => any,
  config?: Record<string, unknown>,
) {
  const ctx = new native.cordis.Context()
  await ctx.plugin(native.systemPrompt.SystemPrompt)
  await ctx.plugin(native.subprocess.LocalSubprocessRuntime)
  await ctx.plugin({
    name: 'native-tools-observer-test-dependencies',
    apply(pluginCtx: any) {
      pluginCtx.provide('agents', {})
      pluginCtx.provide('skills', {})
      pluginCtx.provide('shell', { sandboxMode: undefined })
      pluginCtx.provide('shellEnv', { collect: () => ({}) })
    },
  })
  const runtimeFiber = await ctx.plugin(Runtime, config)
  return { ctx, runtimeFiber }
}

async function mountNativeLayer(ctx: any) {
  const fsSearch = await ctx.plugin(native.fsSearch, { sampleOverCapGlobResults: false })
  const skill = await ctx.plugin(native.skill, {})
  const pwsh = await ctx.plugin(native.pwsh, {})
  return { fsSearch, skill, pwsh }
}

function definitions(ctx: any, scope?: object) {
  return Object.fromEntries(['glob', 'grep', 'skill', 'pwsh'].map(name => [
    name,
    ctx.tools.get(name, scope),
  ])) as Record<'glob' | 'grep' | 'skill' | 'pwsh', any>
}

describe('NativeObservedToolRuntime native registration provenance', () => {
  afterAll(async () => {
    vi.restoreAllMocks()
  })

  it('preserves the installed ToolRuntime plugin contract', () => {
    expect(Object.getPrototypeOf(NativeObservedToolRuntime)).toBe(native.tools.ToolRuntime)
    expect(NativeObservedToolRuntime.name).toBe(native.tools.ToolRuntime.name)
    expect(NativeObservedToolRuntime.Config).toBe(native.tools.ToolRuntime.Config)
    expect(NativeObservedToolRuntime.inject).toBe(native.tools.ToolRuntime.inject)
  })

  it('observes actual fs-search, skill and pwsh registrations without changing definitions', async () => {
    const stock = await createHarness(native.tools.ToolRuntime)
    const observed = await createHarness(NativeObservedToolRuntime)
    try {
      await mountNativeLayer(stock.ctx)
      await mountNativeLayer(observed.ctx)
      const stockDefinitions = definitions(stock.ctx)
      const observedDefinitions = definitions(observed.ctx)

      expect(serializableDeclaration(observedDefinitions)).toEqual(
        serializableDeclaration(stockDefinitions),
      )
      const before = Object.fromEntries(Object.entries(observedDefinitions).map(
        ([name, definition]) => [name, functionReferences(definition)],
      ))
      expect(observed.ctx.tools.nativeRegistration(observedDefinitions.glob))
        .toEqual(expectedProducer.fsSearch)
      expect(observed.ctx.tools.nativeRegistration(observedDefinitions.grep))
        .toEqual(expectedProducer.fsSearch)
      expect(observed.ctx.tools.nativeRegistration(observedDefinitions.skill))
        .toEqual(expectedProducer.skill)
      expect(observed.ctx.tools.nativeRegistration(observedDefinitions.pwsh))
        .toEqual(expectedProducer.pwsh)
      expect(Object.fromEntries(Object.entries(observedDefinitions).map(
        ([name, definition]) => [name, functionReferences(definition)],
      ))).toEqual(before)
      expect(observed.ctx.tools.schemas().map((schema: any) => schema.name).sort())
        .toEqual(['glob', 'grep', 'pwsh', 'skill'])
      expect(observed.ctx.registry.has(NativeObservedToolRuntime)).toBe(true)
      expect(observed.ctx.registry.has(native.tools.ToolRuntime)).toBe(false)
    } finally {
      await observed.ctx.fiber.dispose()
      await stock.ctx.fiber.dispose()
    }
  })

  it('loads the built public provider through a real disabled and injection-gated loader entry', async () => {
    const builtUrl = pathToFileURL(resolve(
      import.meta.dirname,
      '../../packages/tianwen-runtime-bundle/dist/native-tools-observer.js',
    )).href
    const built = await import(builtUrl) as {
      default: new (ctx: any, config?: any) => any
    }
    const loader = await load('@deepseek-ai/cordis-plugin-loader') as {
      default: new (ctx: any, config?: any) => any
    }
    const ctx = new native.cordis.Context()
    const config = { mode: 'native', maxParallelSubCalls: 3 }
    const inject = ['systemPrompt', 'configured-ready']
    try {
      await ctx.plugin(native.systemPrompt.SystemPrompt)
      await ctx.plugin(loader.default, { baseUrl: pathToFileURL(import.meta.dirname).href })
      const id = await ctx.loader.create({
        name: builtUrl,
        config,
        inject,
        disabled: true,
      })
      await ctx.loader.await()

      const entry = ctx.loader.resolve(id)
      expect(entry.options).toMatchObject({
        id,
        name: builtUrl,
        config,
        inject,
        disabled: true,
      })
      expect(entry.disabled).toBe(true)
      expect(entry.fiber).toBeUndefined()
      expect(ctx.get('tools')).toBeUndefined()

      await ctx.loader.update(id, { config, inject, disabled: false })
      await ctx.loader.await()
      expect(entry.options).toMatchObject({ config, inject, disabled: false })
      expect(entry.fiber?.state).toBe(0)
      expect(ctx.get('tools')).toBeUndefined()

      const ready = await ctx.plugin({
        name: 'configured-ready-provider',
        apply(pluginCtx: any) { pluginCtx.provide('configured-ready', {}) },
      })
      await ctx.loader.await()
      expect(entry.fiber?.state).toBe(2)
      expect(entry.fiber?.config).toEqual(config)
      expect(typeof built.default).toBe('function')
      const loaderExport = ctx.loader.unwrapExports(await ctx.loader.import(builtUrl))
      expect(entry.fiber?.runtime.callback).toBe(ctx.registry.resolve(loaderExport))
      expect(ctx.tools.nativeRegistration).toEqual(expect.any(Function))

      await ready.dispose()
      await ctx.loader.await()
      expect(entry.fiber?.state).toBe(0)
      expect(ctx.get('tools')).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('keeps global tools, independent native scopes, shadows, restrictions and disposal stock', async () => {
    const { ctx } = await createHarness(NativeObservedToolRuntime)
    const keyA = {}, keyB = {}, keyShadow = {}
    const scopeA = native.scope.createScope(ctx, keyA)
    const scopeB = native.scope.createScope(ctx, keyB)
    const scopeShadow = native.scope.createScope(ctx, keyShadow)
    let shadowDisposer: (() => void) | undefined
    const shadowDefinition = {
      name: 'glob',
      description: 'existing same-name shadow',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args: unknown, value: string) => [{ type: 'text', text: value }],
      },
      execute: async () => 'shadow',
    }
    const shadowFiber = await scopeShadow.ctx.plugin({
      name: 'existing-shadow',
      inject: ['tools'],
      apply(pluginCtx: any) {
        shadowDisposer = pluginCtx.tools.register(shadowDefinition)
      },
    })
    try {
      const globalFibers = await mountNativeLayer(ctx)
      const fibersA = await mountNativeLayer(scopeA.ctx)
      await mountNativeLayer(scopeB.ctx)
      const global = definitions(ctx)
      const a = definitions(ctx, keyA)
      const b = definitions(ctx, keyB)
      const individuallyDisposed = {
        name: 'native-individual-disposer',
        description: 'native individual disposer',
        parameters: {},
        output: { schema: { type: 'string' }, render: () => [] },
        execute: async () => 'registered from the actual native fiber',
      }
      const disposeIndividual = globalFibers.fsSearch.ctx.tools.register(
        individuallyDisposed,
      )

      expect(a.glob).not.toBe(global.glob)
      expect(b.glob).not.toBe(global.glob)
      expect(a.glob).not.toBe(b.glob)
      expect(ctx.tools.get('glob', keyShadow)).toBe(shadowDefinition)
      expect(ctx.tools.nativeRegistration(a.glob)).toEqual(expectedProducer.fsSearch)
      expect(ctx.tools.nativeRegistration(a.skill)).toEqual(expectedProducer.skill)
      expect(ctx.tools.nativeRegistration(a.pwsh)).toEqual(expectedProducer.pwsh)
      expect(ctx.tools.nativeRegistration(shadowDefinition)).toBeUndefined()
      expect(ctx.tools.nativeRegistration(individuallyDisposed))
        .toEqual(expectedProducer.fsSearch)
      disposeIndividual()
      expect(ctx.tools.nativeRegistration(individuallyDisposed)).toBeUndefined()
      disposeIndividual()

      const lift = shadowFiber.ctx.tools.restrict({ deny: ['grep'] })
      expect(ctx.tools.get('glob', keyShadow)).toBe(shadowDefinition)
      expect(ctx.tools.get('grep', keyShadow)).toBeUndefined()
      expect(ctx.tools.get('grep', keyA)).toBe(a.grep)
      lift()
      expect(ctx.tools.get('grep', keyShadow)).toBe(global.grep)

      await fibersA.fsSearch.dispose()
      expect(ctx.tools.get('glob', keyA)).toBe(global.glob)
      expect(ctx.tools.get('glob', keyB)).toBe(b.glob)
      expect(ctx.tools.nativeRegistration(a.glob)).toBeUndefined()
      expect(ctx.tools.nativeRegistration(global.glob)).toEqual(expectedProducer.fsSearch)

      shadowDisposer!()
      expect(ctx.tools.get('glob', keyShadow)).toBe(global.glob)
      shadowDisposer!()
      expect(ctx.tools.get('glob', keyShadow)).toBe(global.glob)
      expect(ctx.tools.nativeRegistration(shadowDefinition)).toBeUndefined()

      await globalFibers.skill.dispose()
      expect(ctx.tools.nativeRegistration(global.skill)).toBeUndefined()
    } finally {
      await scopeShadow.dispose()
      await scopeB.dispose()
      await scopeA.dispose()
      await ctx.fiber.dispose()
    }
  })

  it('fails closed for changed functions, changed schemas, reused definitions and ambiguous origins', async () => {
    const { ctx } = await createHarness(NativeObservedToolRuntime)
    try {
      const nativeFibers = await mountNativeLayer(ctx)
      const glob = ctx.tools.get('glob')
      const originalExecute = glob.execute
      glob.execute = async () => ({ root: '.', paths: [] })
      expect(ctx.tools.nativeRegistration(glob)).toBeUndefined()
      glob.execute = originalExecute

      const originalDescription = glob.description
      const originalParameters = glob.parameters
      glob.parameters = {
        ...originalParameters,
        pattern: { ...originalParameters.pattern, description: 'changed schema' },
      }
      expect(ctx.tools.nativeRegistration(glob)).toBeUndefined()
      glob.parameters = originalParameters
      expect(glob.description).toBe(originalDescription)
      expect(ctx.tools.nativeRegistration({ ...glob })).toBeUndefined()

      await nativeFibers.fsSearch.dispose()
      let reuseError: unknown
      try {
        await ctx.plugin({
          name: 'native-definition-reuse',
          inject: ['tools'],
          apply(pluginCtx: any) {
            pluginCtx.tools.register(glob)
            pluginCtx.tools.register(glob)
          },
        })
      } catch (error) {
        reuseError = error
      }
      expect(reuseError).toBeInstanceOf(Error)
      expect(ctx.tools.nativeRegistration(glob)).toBeUndefined()

      let ambiguousCtx: any
      const ambiguousFiber = await ctx.plugin({
        name: 'ambiguous-registration',
        inject: ['tools'],
        apply(pluginCtx: any) { ambiguousCtx = pluginCtx },
      })
      const definition = {
        name: 'ambiguous', description: 'ambiguous', parameters: {},
        output: { schema: { type: 'string' }, render: () => [] },
        execute: async () => 'ambiguous',
      }
      const callback = ambiguousFiber.runtime.callback
      const resolve = vi.spyOn(ctx.registry, 'resolve').mockReturnValue(callback)
      const disposer = ambiguousCtx.tools.register(definition)
      resolve.mockRestore()
      expect(ctx.tools.get('ambiguous')).toBe(definition)
      expect(ctx.tools.nativeRegistration(definition)).toBeUndefined()
      disposer()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('cannot replace the parent registration result or error when observation fails', async () => {
    const stock = await createHarness(native.tools.ToolRuntime)
    const observed = await createHarness(NativeObservedToolRuntime)
    const definition = {
      name: 'observation-failure', description: 'observation failure', parameters: {},
      output: { schema: { type: 'string' }, render: () => [] },
      execute: async () => 'registered',
    }
    try {
      const stockDisposer = stock.ctx.tools.register(definition)
      const stockError = (() => {
        try { stock.ctx.tools.register(definition) } catch (error) { return error }
      })()
      stockDisposer()

      const failure = new Error('observation must stay contained')
      const parentRegister = native.tools.ToolRuntime.prototype.register
      let parentDisposer: (() => void) | undefined
      const register = vi.spyOn(native.tools.ToolRuntime.prototype, 'register')
        .mockImplementation(function (this: any, value: any) {
          parentDisposer = parentRegister.call(this, value)
          return parentDisposer
        })
      const resolve = vi.spyOn(observed.ctx.registry, 'resolve').mockImplementation(() => {
        throw failure
      })
      const disposer = observed.ctx.tools.register(definition)
      expect(disposer).toBe(parentDisposer)
      expect(observed.ctx.tools.get(definition.name)).toBe(definition)
      const observedError = (() => {
        try { observed.ctx.tools.register(definition) } catch (error) { return error }
      })()
      expect(observedError).toBeInstanceOf((stockError as Error).constructor)
      expect((observedError as Error).message).toBe((stockError as Error).message)
      expect(observedError).not.toBe(failure)
      const exactParentError = new Error('exact parent failure')
      register.mockImplementationOnce(() => { throw exactParentError })
      let propagated: unknown
      try {
        observed.ctx.tools.register({ ...definition, name: 'parent-error' })
      } catch (error) {
        propagated = error
      }
      expect(propagated).toBe(exactParentError)
      resolve.mockRestore()
      register.mockRestore()
      disposer()
    } finally {
      await observed.ctx.fiber.dispose()
      await stock.ctx.fiber.dispose()
    }
  })

  it('executes one actual native glob search on a new tiny portable fixture', async () => {
    const base = process.env.TIANWEN_FILE_TEST_ROOT ?? join(tmpdir(), 'tianwen-native-tests')
    const fixtureBase = join(base, 'native-tools-observer')
    mkdirSync(fixtureBase, { recursive: true })
    const fixture = mkdtempSync(join(fixtureBase, 'native-tools-observer-'))
    writeFileSync(join(fixture, 'alpha.txt'), 'alpha')
    writeFileSync(join(fixture, 'beta.md'), 'beta')
    const { ctx } = await createHarness(NativeObservedToolRuntime)
    try {
      await ctx.plugin(native.fsSearch, { sampleOverCapGlobResults: false })
      const result = await ctx.tools.execute({
        callId: 'native-tools-observer-glob',
        name: 'glob',
        arguments: { pattern: '*.txt' },
        agent: { session: { header: { cwd: fixture } } },
        signal: new AbortController().signal,
      })
      expect(result).toMatchObject({
        isError: false,
        value: { root: '.', paths: ['alpha.txt'] },
      })
      expect(ctx.tools.nativeRegistration(ctx.tools.get('glob')))
        .toEqual(expectedProducer.fsSearch)
    } finally {
      await ctx.fiber.dispose()
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
