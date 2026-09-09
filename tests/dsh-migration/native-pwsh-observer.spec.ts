import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { mkdir, mkdtemp, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { connect } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { TianwenNativeToolObservationService, parseNativeDirectoryReceipt } from '../../packages/tianwen-runtime-bundle/src/native-tool-observation.js'
import { NativeObservedPwshExecutor, withNativePwshObservation } from '../../packages/tianwen-runtime-bundle/src/native-pwsh-observer.js'

describe('native pwsh producer export', () => {
  it('inherits the sole native shell provider contract', () => {
    expect(NativeObservedPwshExecutor.inject).toEqual(['subprocess', 'sandbox', 'sandboxPolicy'])
  })
  it.each([false,true])('explicit pre-boot transformation preserves configured row metadata and disabled=%s', disabled => {
    const native = {id:'pwsh-sandbox',name:'@deepseek-ai/dsh-pwsh-sandbox',config:{cwd:'E:/configured',pwshPath:'D:/pwsh/pwsh.exe',timeoutMs:12345,maxTimeoutMs:23456,maxOutputBytes:4096,maxSpillBytes:8192,graceMs:250},inject:['subprocess','sandbox','sandboxPolicy','ready'],disabled}
    const unrelated = {id:'another',name:'another-plugin',config:{keep:true}}
    const output = withNativePwshObservation([native,unrelated])
    expect(output).toEqual([{...native,name:'@tianwen/runtime-bundle/native-pwsh-observer'},unrelated])
    expect(native.name).toBe('@deepseek-ai/dsh-pwsh-sandbox')
  })
  it('keeps unsupported or ambiguous entry lists unchanged', () => {
    const native={id:'pwsh-sandbox',name:'@deepseek-ai/dsh-pwsh-sandbox'}
    for (const entries of [[{...native,name:'custom-shell'}],[native,{...native}],[native,{id:'observer',name:'@tianwen/runtime-bundle/native-pwsh-observer'}]]) {
      expect(withNativePwshObservation(entries)).toEqual(entries)
    }
  })
})

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const load = (name: string) => import(/* @vite-ignore */ pathToFileURL(cliRequire.resolve(name)).href)
describe.skipIf(process.platform !== 'win32')('native product gate', () => {
  let stock: Context, observed: Context, workspace: string
  let compose: (executor: any, config?: Record<string, unknown>) => Promise<Context>
  const evidence: unknown[] = []
  const originalTemp = { TEMP:process.env.TEMP, TMP:process.env.TMP }
  const identity = {taskId:'native-product',sessionId:'native-session',callId:'native-call'}
  beforeAll(async () => {
    const base = process.env.TIANWEN_FILE_TEST_ROOT ?? join(tmpdir(), 'tianwen-native-tests')
    const root=join(base,'native-pwsh-observer')
    await mkdir(root,{recursive:true}); workspace=await mkdtemp(join(root,'product-'))
    const temp=await mkdtemp(join(root,'temp-'))
    process.env.TEMP=temp; process.env.TMP=temp
    await mkdir(join(workspace,'nested'))
    await Promise.all([writeFile(join(workspace,'one.txt'),'one'),writeFile(join(workspace,'two.txt'),'two'),writeFile(join(workspace,'nested','three.txt'),'three')])
    const [subprocess,sandbox,policy,pwsh] = await Promise.all(['@deepseek-ai/dsh-subprocess-local','@deepseek-ai/dsh-sandbox-local','@deepseek-ai/dsh-sandbox-policy','@deepseek-ai/dsh-pwsh-sandbox'].map(load))
    compose = async (executor: any, config = {}) => {
      const ctx=new Context()
      await ctx.plugin(subprocess.LocalSubprocessRuntime)
      await ctx.plugin(sandbox.LocalSandboxProvider,{})
      await ctx.plugin(policy.SandboxPolicyService,{mode:'workspace-write',workspaceRoot:workspace})
      await ctx.plugin(TianwenNativeToolObservationService)
      await ctx.plugin(executor,{cwd:workspace,timeoutMs:15000,maxTimeoutMs:15000,maxOutputBytes:65536,maxSpillBytes:65536,graceMs:500,...config})
      return ctx
    }
    stock=await compose(pwsh.SandboxPwshExecutor); observed=await compose(NativeObservedPwshExecutor)
  })
  afterAll(async () => {
    await stock?.fiber.dispose(); await observed?.fiber.dispose()
    if (workspace) await writeFile(workspace+'-native-gate.json',JSON.stringify({workspace,cases:evidence},null,2))
    for (const [key,val] of Object.entries(originalTemp)) { if (val === undefined) delete process.env[key]; else process.env[key]=val }
  })
  async function runStockAndObservedWithoutCapture(command: string) {
    const spy=vi.spyOn(observed.shell as any,'qualify')
    try {
      return {stock:await stock.shell.run(stock.shell.resolve({command})),observed:await observed.shell.run(observed.shell.resolve({command})),preflightCalls:spy.mock.calls.length}
    } finally {spy.mockRestore()}
  }
  it('leaves native execution untouched outside capture',async () => {
    const result=await runStockAndObservedWithoutCapture('Get-Location')
    expect(result.observed).toEqual(result.stock); expect(result.preflightCalls).toBe(0)
  })
  it.each([
    ['Get-ChildItem -Recurse -File -Depth 2 | Select-Object FullName, Length | Format-Table -AutoSize',true],
    ['Get-Location; Get-ChildItem -Force | Select-Object Name',true],
    ["Get-ChildItem -LiteralPath './missing-native-probe'",false],
  ])('preserves full native result: %s',async (command,certifies) => {
    const baseline=await stock.shell.run(stock.shell.resolve({command}))
    const captured=await observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run(observed.shell.resolve({command})))
    evidence.push({command,baseline,captured})
    expect(captured.result).toEqual(baseline)
    if (certifies) {
      expect(captured.receipt).toBeDefined()
      expect(parseNativeDirectoryReceipt(captured.receipt).nativeResultDigest).toBe(sha256(baseline))
    } else {expect(captured.result.exitCode).toBe(1);expect(captured.receipt).toBeUndefined()}
  })
  it.each(["& 'Get-Location'",'function Fake { Get-Location }; Fake','$x=1; Get-Location','Get-ChildItem | Select-Object { $_.Name }','Get-Location > $null'])('rejects dynamic or effectful syntax: %s',async command => {
    const captured=await observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run(observed.shell.resolve({command})))
    expect(captured.receipt).toBeUndefined()
  })
  it('bypasses short timeouts without preflight',async () => {
    const spy=vi.spyOn(observed.shell as any,'qualify')
    try {
      const value=await observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run(observed.shell.resolve({command:'Get-Location',timeoutMs:4000})))
      expect(value.receipt).toBeUndefined();expect(spy).not.toHaveBeenCalled()
    } finally {spy.mockRestore()}
  })
  it('preserves result when the receiver fails',async () => {
    const baseline=await stock.shell.run(stock.shell.resolve({command:'Get-Location'}))
    const receiver=vi.spyOn(observed.shell as any,'receive').mockRejectedValue(new Error('receiver unavailable'))
    try {
      const value=await observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run(observed.shell.resolve({command:'Get-Location'})))
      expect(value.result).toEqual(baseline);expect(value.receipt).toBeUndefined()
    } finally {receiver.mockRestore()}
  })
  it('preserves the native result if optional execution settings cannot be digested',async () => {
    const baseline=await stock.shell.run(stock.shell.resolve({command:'Get-Location'}))
    const captured=await observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run({...observed.shell.resolve({command:'Get-Location'}),env:undefined}))
    expect(captured.result).toEqual(baseline)
  })
  it('isolates concurrent native call identities',async () => {
    const values=await Promise.all(['left','right'].map(callId=>observed.tianwenNativeToolObservation.capture({...identity,callId},()=>observed.shell.run(observed.shell.resolve({command:'Get-Location'})))))
    expect(values.map(v=>v.receipt?.identity.callId)).toEqual(['left','right'])
  })
  it('shares the service capture across independent built entry bundles',async () => {
    const boot=await load('@deepseek-ai/dsh-app-boot')
    const loader=await load('@deepseek-ai/cordis-plugin-loader')
    const base=boot.loadOverlayPatches('tianwen-test',cliRequire.resolve('@deepseek-ai/dsh-base/cordis.patch.yml'))
    const patch=boot.loadOverlayPatches('tianwen-test',join(import.meta.dirname,'../../packages/tianwen-runtime-bundle/goal-first.patch.yml'))
    const entries=withNativePwshObservation(boot.composeEntries([base,patch]))
    const shells=entries.filter(row=>['@deepseek-ai/dsh-pwsh-sandbox','@tianwen/runtime-bundle/native-pwsh-observer'].includes(row.name ?? '') && !loader.interpolate({process},row.disabled))
    expect(shells.map(row=>row.name)).toEqual(['@tianwen/runtime-bundle/native-pwsh-observer'])
    const built=await import('../../packages/tianwen-runtime-bundle/dist/native-pwsh-observer.js')
    const ctx=await compose(built.default)
    try {
      const value=await ctx.tianwenNativeToolObservation.capture(identity,()=>ctx.shell.run(ctx.shell.resolve({command:'Get-Location'})))
      expect(value.receipt?.identity).toEqual(identity)
      expect(value.result.exitCode).toBe(0)
    } finally {await ctx.fiber.dispose()}
  })
  it('explicit configured composition preserves stock cwd interpreter and limits without capture',async () => {
    const config={cwd:join(workspace,'nested'),pwshPath:(stock.shell as any).pwshPath,timeoutMs:12000,maxTimeoutMs:13000,maxOutputBytes:2048,maxSpillBytes:4096,graceMs:250}
    const boot=await load('@deepseek-ai/dsh-app-boot')
    const base=boot.loadOverlayPatches('tianwen-test',cliRequire.resolve('@deepseek-ai/dsh-base/cordis.patch.yml'))
    const patch=boot.loadOverlayPatches('tianwen-test',join(import.meta.dirname,'../../packages/tianwen-runtime-bundle/goal-first.patch.yml'))
    const entries=withNativePwshObservation(boot.composeEntries([base,[{id:'pwsh-sandbox',config}],patch]))
    const selected=entries.find(row=>row.id === 'pwsh-sandbox')!
    expect(selected.name).toBe('@tianwen/runtime-bundle/native-pwsh-observer')
    expect(selected.config).toEqual(config)
    const built=await import('../../packages/tianwen-runtime-bundle/dist/native-pwsh-observer.js')
    const native=await load('@deepseek-ai/dsh-pwsh-sandbox')
    const configuredStock=await compose(native.SandboxPwshExecutor,config)
    const configuredObserver=await compose(built.default,selected.config as Record<string,unknown>)
    const preflight=vi.spyOn(configuredObserver.shell as any,'qualify')
    try {
      const request={command:'Get-Location',timeoutMs:14000}
      expect(configuredObserver.shell.resolve(request)).toEqual(configuredStock.shell.resolve(request))
      expect(configuredObserver.shell.resolve(request)).toMatchObject({workdir:config.cwd,timeoutMs:13000,stdoutMaxBytes:2048})
      expect((configuredObserver.shell as any).pwshPath).toBe(config.pwshPath)
      expect((configuredObserver.shell as any).config).toMatchObject(config)
      const result=await configuredObserver.shell.run(configuredObserver.shell.resolve(request))
      expect(result).toEqual(await configuredStock.shell.run(configuredStock.shell.resolve(request)))
      expect(preflight).not.toHaveBeenCalled()
    } finally {preflight.mockRestore();await configuredObserver.fiber.dispose();await configuredStock.fiber.dispose()}
  })
  it('finishes when a connected receiver stops reading',async () => {
    const baseline=await stock.shell.run(stock.shell.resolve({command:'Get-Location'}))
    const receiver=vi.spyOn(observed.shell as any,'receive').mockImplementation(async (pipe: any) => {
      const until=Date.now()+3500
      while (Date.now()<until) {
        const client=await new Promise<any>(resolve=>{
          const socket=connect(`\\\\.\\pipe\\${pipe}`)
          socket.once('connect',()=>resolve(socket));socket.once('error',()=>{socket.destroy();resolve(undefined)})
        })
        if (client) {
          client.pause()
          await new Promise(resolve=>setTimeout(resolve,500))
          client.destroy()
          return {frames:[],eof:false}
        }
        await new Promise(resolve=>setTimeout(resolve,15))
      }
      return {frames:[],eof:false}
    })
    try {
      const value=await observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run(observed.shell.resolve({command:'Get-Location'})))
      expect(value.result).toEqual(baseline);expect(value.receipt).toBeUndefined()
    } finally {receiver.mockRestore()}
  })
  it('cleans up observation when native cancellation interrupts its launch',async () => {
    const controller=new AbortController()
    const original=(observed.shell as any).receive.bind(observed.shell)
    const receiver=vi.spyOn(observed.shell as any,'receive').mockImplementation((...args:any[])=>{
      setTimeout(()=>controller.abort(),30)
      return original(...args)
    })
    try {
      const value=await observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run(observed.shell.resolve({command:'Get-Location',signal:controller.signal})))
      expect(value.result.aborted).toBe(true);expect(value.receipt).toBeUndefined()
    } finally {receiver.mockRestore()}
    expect(observed.tianwenNativeToolObservation.current()).toBeUndefined()
  })
  it('keeps background start stock even when a resolved spec is already being observed',async () => {
    const spec=observed.shell.resolve({command:'Get-Location'})
    let backgroundArgv: string[]=[]
    let background: ReturnType<typeof observed.shell.start> | undefined
    const argv=vi.spyOn(observed.shell as any,'argv')
    const receiver=vi.spyOn(observed.shell as any,'receive').mockImplementation(async () => {
      background=observed.shell.start(spec)
      backgroundArgv=argv.mock.results.at(-1)!.value
      return {frames:[],eof:false}
    })
    try {
      const value=await observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run(spec))
      await background?.done
      expect(backgroundArgv.at(-1)).not.toContain('tianwen-native-directory-')
      expect(value.receipt).toBeUndefined()
    } finally {receiver.mockRestore();argv.mockRestore()}
  })
  it('rejects ancestor junctions and paths outside the workspace',async () => {
    const outside=await mkdtemp(join(workspace,'..','outside-'))
    const link=join(workspace,'escape');await symlink(outside,link,'junction')
    for (const command of ["Get-ChildItem -LiteralPath './escape'","Get-ChildItem -LiteralPath '..'", "Get-ChildItem -Path './*'"]) {
      const value=await observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run(observed.shell.resolve({command})))
      expect(value.receipt).toBeUndefined()
    }
  })
  it('releases capture on native cancellation',async () => {
    const controller=new AbortController()
    const running=observed.tianwenNativeToolObservation.capture(identity,()=>observed.shell.run(observed.shell.resolve({command:'Start-Sleep -Seconds 10',signal:controller.signal})))
    const timer=setTimeout(()=>controller.abort(),900)
    try {
      const result=await running;expect(result.result.aborted).toBe(true);expect(result.receipt).toBeUndefined()
    } finally {clearTimeout(timer)}
    expect(observed.tianwenNativeToolObservation.current()).toBeUndefined()
  })
})
