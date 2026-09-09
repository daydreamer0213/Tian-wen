import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox'
import { ENCODING_PREAMBLE } from '@deepseek-ai/dsh-pwsh-local'
import type { ShellExecSpec, ShellRunResult, ShellProcess } from '@deepseek-ai/dsh-shell'
import { lstat, realpath } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { connect, type Socket } from 'node:net'
import { win32 } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { sha256 } from '@tianwen/evolution/learning-intake'
import { insideNativeWorkspace, parseNativeDirectoryCommands, type NativeDirectoryCommand, type NativeDirectoryReceipt } from './native-tool-observation.js'
import { observationPrefix, qualificationScript } from './native-pwsh-observation-scripts.js'

async function admittedPath(root: string, path: string): Promise<boolean> {
  if (!insideNativeWorkspace(root, path)) return false
  // Check every existing ancestor, including the workspace itself; missing leaf
  // components must not conceal an ancestor junction into a different tree.
  let current = win32.parse(path).root
  for (const part of path.slice(current.length).split(/[\\/]/u)) {
    if (!part) continue
    current = win32.join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) return false }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' }
  }
  return insideNativeWorkspace(await realpath(root), await realpath(path))
}

async function admittedPaths(root: string, cwd: string, commands: readonly NativeDirectoryCommand[]): Promise<boolean> {
  if (!await admittedPath(root, cwd)) return false
  for (const cmd of commands) {
    if (cmd.name.toLowerCase() !== 'get-childitem') continue
    for (let i=0; i<cmd.arguments.length; i++) {
      const arg = cmd.arguments[i]!
      if (arg.kind === 'parameter' && !['path','literalpath'].includes(String(arg.value).toLowerCase())) {
        if (!['force','recurse','file','directory'].includes(String(arg.value).toLowerCase())) i++
        continue
      }
      const value = arg.kind === 'parameter' ? cmd.arguments[++i]!.value : arg.value
      for (const path of Array.isArray(value) ? value : [value]) {
        // Wildcard roots and non-FileSystem provider notation have no bounded
        // real-path proof here, so these commands retain stock execution.
        if (typeof path !== 'string' || /[*?\[\]]/u.test(path) || /:(?![\\/])/u.test(path) || path.startsWith('\\\\')) return false
        const resolved = win32.resolve(cwd, path)
        if (!await admittedPath(root, resolved)) return false
      }
    }
  }
  return true
}

function successful(result: ShellRunResult): boolean {
  return result.exitCode === 0 && result.signal === null && !result.timedOut && !result.aborted && !result.stdout.truncated && !result.stderr.truncated && result.stderr.text === '' && result.sandbox?.denied === false && !result.sandbox.runnerFailed
}

/** The native parent retains sandboxing, process ownership, output and cancellation. */
export class NativeObservedPwshExecutor extends SandboxPwshExecutor {
  private readonly prefixes = new WeakMap<ShellExecSpec, string>()
  protected override argv(spec: ShellExecSpec): string[] {
    const argv = super.argv(spec)
    const prefix = this.prefixes.get(spec)
    if (prefix) argv[argv.length - 1] = ENCODING_PREAMBLE + prefix + ' ' + spec.command
    return argv
  }
  override start(spec: ShellExecSpec): ShellProcess {
    this.ctx.get('tianwenNativeToolObservation')?.begin()
    this.prefixes.delete(spec)
    return super.start(spec)
  }
  protected async qualify(spec: ShellExecSpec): Promise<readonly NativeDirectoryCommand[] | undefined> {
    try {
      const result = await super.run({ ...spec, command: qualificationScript(spec.command), stdoutMaxBytes: 32768, timeoutMs: Math.min(spec.timeoutMs, 3500), stdin: undefined })
      if (!successful(result) || Buffer.byteLength(result.stdout.text) > 32768) return undefined
      return parseNativeDirectoryCommands(JSON.parse(result.stdout.text))
    } catch { return undefined }
  }
  /** Bounded transport lifecycle; a disconnected or stalled receiver never owns the process. */
  protected async receive(pipe: string, settled: () => boolean, signal?: AbortSignal): Promise<{ frames: string[][]; eof: boolean }> {
    const until = Date.now() + 3500
    while (Date.now() < until && !settled() && !signal?.aborted) {
      const socket = await new Promise<Socket | undefined>(resolve => {
        const client = connect(`\\\\.\\pipe\\${pipe}`)
        const timer = setTimeout(() => { client.destroy(); resolve(undefined) }, 100)
        client.once('connect', () => { clearTimeout(timer); resolve(client) })
        client.once('error', () => { clearTimeout(timer); client.destroy(); resolve(undefined) })
      })
      if (!socket) { await delay(15); continue }
      return new Promise(resolve => {
        const chunks: Buffer[] = []; let bytes = 0; let finished = false
        const done = (eof: boolean) => {
          if (finished) return
          finished = true; clearInterval(timer); signal?.removeEventListener('abort', abort); socket.destroy()
          try {
            const wire = Buffer.concat(chunks).toString('utf8')
            if (!eof || !wire.endsWith('\n')) return resolve({ frames: [], eof: false })
            const lines = wire.slice(0,-1).split('\n'); if (lines.length > 64) throw new Error('frames')
            const frames = lines.map(line => line.split('\t').map(field => {
              const value = Buffer.from(field, 'base64'); if (value.toString('base64') !== field) throw new Error('encoding')
              const text = new TextDecoder('utf-8', { fatal: true }).decode(value); return text
            }))
            resolve({ frames, eof: true })
          } catch { resolve({ frames: [], eof: false }) }
        }
        const abort = () => done(false)
        const timer = setInterval(() => { if (settled() || Date.now() >= until) done(false) }, 25)
        signal?.addEventListener('abort', abort, { once: true })
        socket.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 65536) done(false); else chunks.push(chunk) })
        socket.once('end', () => done(true)); socket.once('error', () => done(false)); socket.once('close', () => done(false))
      })
    }
    return { frames: [], eof: false }
  }
  override async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    const service = this.ctx.get('tianwenNativeToolObservation')
    const scope = service?.begin()
    if (!scope || process.platform !== 'win32' || scope.runs !== 1 || spec.timeoutMs < 5000 || Buffer.byteLength(spec.command) > 8192 || spec.signal?.aborted) return super.run(spec)
    const commands = await this.qualify(spec)
    const root = spec.sandboxPolicy?.workspaceRoot
    if (!commands || !root || !await admittedPaths(root, spec.workdir, commands).catch(() => false)) return super.run(spec)
    const nonce = randomUUID(); const pipe = `tianwen-native-directory-${nonce}`
    const commandDigest = sha256(spec.command)
    this.prefixes.set(spec, observationPrefix(pipe, nonce, [scope.identity.taskId,scope.identity.sessionId,scope.identity.callId], commandDigest))
    let settled = false
    const observation = this.receive(pipe, () => settled, spec.signal).catch(() => ({ frames: [] as string[][], eof: false }))
    try {
      const result = await super.run(spec).finally(() => { settled = true })
      const received = await observation
      try {
      if (received.eof && successful(result) && await admittedPaths(root, spec.workdir, commands)) {
        const start = received.frames[0]
        const locations = received.frames.filter(frame => frame[0] === 'lookup').map(frame => frame[10])
        if (start && (await Promise.all(locations.map(path => typeof path === 'string' ? admittedPath(root, path) : false))).every(Boolean)) {
          const { signal: _signal, ...settings } = spec
          const receipt: NativeDirectoryReceipt = {
            schemaVersion: 'tianwen.native-pwsh-directory.v1', identity: scope.identity,
            command: spec.command, commandDigest, cwd: spec.workdir, workspaceRoot: root,
            interpreter: { path: this.pwshPath, version: start[4] ?? '' },
            executionSettingsDigest: sha256(JSON.parse(JSON.stringify({ spec: settings, config: this.config }))),
            qualification: { parser: 'System.Management.Automation.Language.Parser', commandDigest, commands },
            processId: Number(start[2]), nonce, nativeResultDigest: sha256(result), frames: received.frames,
          }
          service!.record(scope, receipt)
        }
      }
      } catch { /* Certification failure must never replace the original native result. */ }
      return result
    } finally { settled = true; this.prefixes.delete(spec); await observation }
  }
}
export default NativeObservedPwshExecutor
