import { Context, Service } from '@deepseek-ai/cordis'
import { AsyncLocalStorage } from 'node:async_hooks'
import { win32 } from 'node:path'
import { sha256 } from '@tianwen/evolution/learning-intake'

export interface NativeToolCaptureIdentity { readonly taskId: string; readonly sessionId: string; readonly callId: string }
export interface NativeDirectoryArgument { readonly kind: 'parameter' | 'literal'; readonly value: string | number | readonly string[] }
export interface NativeDirectoryCommand { readonly name: string; readonly arguments: readonly NativeDirectoryArgument[] }
export interface NativeDirectoryReceipt {
  readonly schemaVersion: 'tianwen.native-pwsh-directory.v1'
  readonly identity: NativeToolCaptureIdentity
  readonly command: string
  readonly commandDigest: string
  readonly cwd: string
  readonly workspaceRoot: string
  readonly interpreter: { readonly path: string; readonly version: string }
  readonly executionSettingsDigest: string
  readonly qualification: { readonly parser: 'System.Management.Automation.Language.Parser'; readonly commandDigest: string; readonly commands: readonly NativeDirectoryCommand[] }
  readonly processId: number
  readonly nonce: string
  readonly nativeResultDigest: string
  readonly frames: readonly (readonly string[])[]
}

const implementations: Record<string, readonly [string, string]> = {
  'get-location': ['GetLocationCommand', 'Management'],
  'get-childitem': ['GetChildItemCommand', 'Management'],
  'select-object': ['SelectObjectCommand', 'Utility'],
  'format-table': ['FormatTableCommand', 'Utility'],
}
const properties = new Set(['name', 'fullname', 'length', 'mode', 'lastwritetime', 'extension'])
function assert(ok: unknown): asserts ok { if (!ok) throw new Error('Invalid native directory receipt') }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value))
  const row = value as Record<string, unknown>
  assert(Object.keys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key)))
  return row
}
function text(value: unknown): asserts value is string { assert(typeof value === 'string' && value.length > 0 && value.length <= 8192 && !value.includes('\0')) }
function digest(value: unknown) { assert(typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value)) }
function samePath(a: string, b: string) { return win32.resolve(a).toLowerCase() === win32.resolve(b).toLowerCase() }
export function insideNativeWorkspace(root: string, path: string): boolean {
  if (!win32.isAbsolute(root) || !win32.isAbsolute(path)) return false
  const rel = win32.relative(root, path)
  return rel === '' || (!rel.startsWith('..') && !win32.isAbsolute(rel))
}

/** Validates only parser-produced literal nodes and the explicitly admitted options. */
export function parseNativeDirectoryCommands(value: unknown): readonly NativeDirectoryCommand[] {
  assert(Array.isArray(value) && value.length > 0 && value.length <= 16)
  for (const entry of value) {
    const row = object(entry, ['name', 'arguments'])
    text(row.name)
    const name = row.name.toLowerCase()
    assert(Object.hasOwn(implementations, name) && Array.isArray(row.arguments) && row.arguments.length <= 64)
    const args = row.arguments as unknown[]
    let positionals = 0
    const seen = new Set<string>()
    for (let i = 0; i < args.length; i++) {
      const arg = object(args[i], ['kind', 'value'])
      assert(arg.kind === 'parameter' || arg.kind === 'literal')
      let option: string
      let val: unknown = arg.value
      if (arg.kind === 'parameter') {
        text(val); option = val.toLowerCase()
        assert(!seen.has(option)); seen.add(option)
        const switches = name === 'get-childitem' ? ['file', 'directory', 'force', 'recurse'] : name === 'format-table' ? ['autosize', 'hidetableheaders', 'wrap'] : []
        if (switches.includes(option)) continue
        const next = object(args[++i], ['kind', 'value'])
        assert(next.kind === 'literal'); val = next.value
      } else {
        assert(++positionals === 1)
        option = name === 'get-childitem' ? 'path' : 'property'
      }
      if (name === 'get-childitem' && ['path', 'literalpath', 'filter', 'include', 'exclude'].includes(option)) {
        const strings = Array.isArray(val) ? val : [val]
        assert(strings.length > 0 && strings.length <= 16)
        strings.forEach(text)
      } else if ((name === 'get-childitem' && option === 'depth') || (name === 'select-object' && ['first', 'last', 'skip'].includes(option))) {
        assert(typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 100)
      } else if (['select-object', 'format-table'].includes(name) && option === 'property') {
        const strings = Array.isArray(val) ? val : [val]
        assert(strings.length > 0 && strings.length <= 6 && strings.every(v => typeof v === 'string' && properties.has(v.toLowerCase())))
      } else assert(false)
    }
    assert(name !== 'get-location' || args.length === 0)
  }
  return structuredClone(value) as NativeDirectoryCommand[]
}

export function parseNativeDirectoryReceipt(value: unknown): NativeDirectoryReceipt {
  const row = object(value, ['schemaVersion','identity','command','commandDigest','cwd','workspaceRoot','interpreter','executionSettingsDigest','qualification','processId','nonce','nativeResultDigest','frames'])
  assert(row.schemaVersion === 'tianwen.native-pwsh-directory.v1')
  const id = object(row.identity, ['taskId','sessionId','callId']); Object.values(id).forEach(value => { text(value); assert(value.length <= 512) })
  text(row.command); assert(Buffer.byteLength(row.command) <= 8192)
  digest(row.commandDigest); assert(row.commandDigest === sha256(row.command))
  digest(row.executionSettingsDigest); digest(row.nativeResultDigest)
  text(row.cwd); text(row.workspaceRoot); assert(insideNativeWorkspace(row.workspaceRoot, row.cwd))
  text(row.nonce); assert(/^[a-f0-9-]{36}$/u.test(row.nonce))
  assert(typeof row.processId === 'number' && Number.isSafeInteger(row.processId) && row.processId > 0)
  const interpreter = object(row.interpreter, ['path','version']); text(interpreter.path); text(interpreter.version)
  assert(win32.isAbsolute(interpreter.path) && /^\d+\.\d+\.\d+/u.test(interpreter.version))
  const qualification = object(row.qualification, ['parser','commandDigest','commands'])
  assert(qualification.parser === 'System.Management.Automation.Language.Parser' && qualification.commandDigest === row.commandDigest)
  const commands = parseNativeDirectoryCommands(qualification.commands)
  const names = new Set(commands.map(cmd => cmd.name.toLowerCase()))
  assert(Array.isArray(row.frames) && row.frames.length >= 3 && row.frames.length <= 64)
  const frames = row.frames as unknown[]
  let bytes = 0
  for (const frame of frames) {
    assert(Array.isArray(frame) && frame.length <= 14 && frame.every(v => typeof v === 'string' && v.length <= 65536))
    bytes += frame.map(v => Buffer.from(v as string).toString('base64')).join('\t').length + 1
    assert(bytes <= 65536 && frame[1] === row.nonce && frame[2] === String(row.processId))
  }
  const start = frames[0] as string[]
  const terminal = frames.at(-1) as string[]
  const home = win32.dirname(interpreter.path)
  assert(start.length === 14 && start[0] === 'start' && samePath(start[3]!, interpreter.path) && start[4] === interpreter.version && start[5] === 'FullLanguage' && samePath(start[6]!, row.cwd) && start[7] === 'FileSystem' && start[8] === 'Microsoft.PowerShell.Commands.FileSystemProvider' && samePath(start[9]!, win32.join(home, 'System.Management.Automation.dll')))
  assert(start[10] === id.taskId && start[11] === id.sessionId && start[12] === id.callId && start[13] === row.commandDigest)
  assert(terminal.length === 5 && terminal[0] === 'terminal' && terminal[3] === 'PowerShell.Exiting' && terminal[4] === 'PowerShell.Exiting')
  const observed = new Set<string>()
  for (const entry of frames.slice(1,-1)) {
    const f = entry as string[]
    assert(f.length === 12 && f[0] === 'lookup')
    const name = f[3]!.toLowerCase(); const impl = implementations[name]
    assert(impl && names.has(name) && f[4] === 'Cmdlet' && f[5]!.toLowerCase() === name)
    assert(f[6] === `Microsoft.PowerShell.${impl[1]}` && f[8] === `Microsoft.PowerShell.Commands.${impl[0]}`)
    assert(samePath(f[7]!, win32.join(home, 'Modules', `Microsoft.PowerShell.${impl[1]}`, `Microsoft.PowerShell.${impl[1]}.psd1`)) && samePath(f[9]!, win32.join(home, `Microsoft.PowerShell.Commands.${impl[1]}.dll`)))
    assert(f[11] === 'FileSystem' && insideNativeWorkspace(row.workspaceRoot, f[10]!))
    observed.add(name)
  }
  assert([...names].every(name => observed.has(name)))
  return structuredClone(value) as NativeDirectoryReceipt
}

interface CaptureScope { readonly identity: NativeToolCaptureIdentity; runs: number; closed: boolean; receipt?: NativeDirectoryReceipt }
declare module '@deepseek-ai/cordis' { interface Context { tianwenNativeToolObservation: TianwenNativeToolObservationService } }
export class TianwenNativeToolObservationService extends Service {
  private readonly storage = new AsyncLocalStorage<CaptureScope>()
  constructor(ctx: Context) { super(ctx, 'tianwenNativeToolObservation') }
  current(): CaptureScope | undefined { const scope = this.storage.getStore(); return scope?.closed ? undefined : scope }
  begin(): CaptureScope | undefined {
    const scope = this.current()
    if (scope) { scope.runs++; delete scope.receipt }
    return scope
  }
  record(scope: CaptureScope, receipt: NativeDirectoryReceipt): void {
    try {
      const parsed = parseNativeDirectoryReceipt(receipt)
      if (scope.closed || scope.runs !== 1 || JSON.stringify(parsed.identity) !== JSON.stringify(scope.identity)) return
      scope.receipt = parsed
    } catch { delete scope.receipt }
  }
  async capture<T>(identity: NativeToolCaptureIdentity, next: () => Promise<T>): Promise<{ readonly result: T; readonly receipt?: NativeDirectoryReceipt }> {
    const id = object(identity, ['taskId','sessionId','callId']); Object.values(id).forEach(value => { text(value); assert(value.length <= 512) })
    const scope: CaptureScope = { identity: { ...identity }, runs: 0, closed: false }
    return this.storage.run(scope, async () => {
      try { const result = await next(); return { result, ...(scope.runs === 1 && scope.receipt ? { receipt: scope.receipt } : {}) } }
      finally { scope.closed = true; delete scope.receipt }
    })
  }
}
