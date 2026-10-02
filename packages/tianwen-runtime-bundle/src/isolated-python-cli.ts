import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { isUtf8 } from 'node:buffer'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

export const isolatedPythonPolicy = Object.freeze({ sourceBytes: 20480, ioBytes: 32768, maxTimeoutMs: 20000,
  cpu: 500000000, memory: 134217728, pids: 32, tmpfs: 'rw,nosuid,nodev,noexec,size=16777216' })
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const modulePath = fileURLToPath(import.meta.url), moduleHash = hash(readFileSync(modulePath))
const execute = promisify(execFile)
type Row = Record<string, any>

/** Strict bounded JSON, duplicate-key rejection and exact decimal values, without binary float rounding. */
export function canonicalJsonResult(text: string): string {
  assert(Buffer.byteLength(text) <= isolatedPythonPolicy.ioBytes)
  let position = 0
  const whitespace = () => { while (/[\u0020\t\n\r]/u.test(text[position] ?? '') && position < text.length) position++ }
  const take = (character: string) => { whitespace(); assert(text[position++] === character) }
  const string = (): string => {
    whitespace(); const start = position; assert(text[position++] === '"')
    while (position < text.length) {
      const character = text[position++]
      if (character === '\\') position++
      else if (character === '"') return JSON.parse(text.slice(start, position)) as string
    }
    throw new Error('Unterminated JSON string')
  }
  const value = (depth: number): string => {
    assert(depth <= 64); whitespace()
    if (text[position] === '"') return `s${JSON.stringify(string())}`
    if (text[position] === '{') {
      position++; whitespace(); const entries = new Map<string, string>()
      if (text[position] !== '}') for (;;) {
        const key = string(); assert(!entries.has(key)); take(':'); entries.set(key, value(depth + 1)); whitespace()
        if (text[position] === '}') break
        take(',')
      }
      take('}'); return `o{${[...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, entry]) => `${JSON.stringify(key)}:${entry}`).join(',')}}`
    }
    if (text[position] === '[') {
      position++; whitespace(); const entries: string[] = []
      if (text[position] !== ']') for (;;) {
        entries.push(value(depth + 1)); whitespace(); if (text[position] === ']') break; take(',')
      }
      take(']'); return `a[${entries.join(',')}]`
    }
    for (const literal of ['true', 'false', 'null']) if (text.startsWith(literal, position)) { position += literal.length; return literal }
    const number = text.slice(position).match(/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?/u)
    assert(number !== null); position += number[0].length
    const fraction = number[3] ?? '', digits = (number[2]! + fraction).replace(/^0+/u, '')
    if (digits === '') return 'n0:0'
    const coefficient = digits.replace(/0+$/u, ''), exponent = BigInt(number[4] ?? '0') - BigInt(fraction.length) + BigInt(digits.length - coefficient.length)
    return `n${number[1]}${coefficient}:${exponent}`
  }
  const canonical = value(0); whitespace(); assert(position === text.length); return canonical
}

export interface IsolatedPythonIdentity { readonly name: string; readonly label: string; readonly imageId: string; readonly source: string }
export function validateIsolatedPythonContainer(value: unknown, identity: IsolatedPythonIdentity): void {
  const row = value as Row, hc = row.HostConfig as Row, config = row.Config as Row
  assert.match(row.Id, /^[a-f0-9]{64}$/u); assert.equal(row.Name, `/${identity.name}`)
  assert.equal(row.Image, identity.imageId); assert.equal(config.Labels['tianwen.isolated-cli'], identity.label)
  assert.equal(config.User, '65532:65532'); assert.equal(config.OpenStdin, true); assert.equal(config.Tty, false)
  assert(config.Entrypoint === null || Array.isArray(config.Entrypoint) && config.Entrypoint.length === 0)
  assert.equal(config.WorkingDir, '/tmp')
  assert.deepEqual(config.Cmd, ['python3', '-I', '-S', '-B', '-c', identity.source])
  assert.equal(hc.NetworkMode, 'none'); assert.equal(hc.ReadonlyRootfs, true); assert.equal(hc.Privileged, false)
  assert.equal(hc.Memory, isolatedPythonPolicy.memory); assert.equal(hc.MemorySwap, hc.Memory)
  assert.equal(hc.NanoCpus, isolatedPythonPolicy.cpu); assert.equal(hc.PidsLimit, isolatedPythonPolicy.pids)
  assert.deepEqual(hc.CapDrop, ['ALL']); assert(hc.CapAdd == null || hc.CapAdd.length === 0)
  assert(hc.SecurityOpt.includes('no-new-privileges')); assert.deepEqual(row.Mounts, [])
  assert(hc.Binds == null || hc.Binds.length === 0); assert(hc.Devices == null || hc.Devices.length === 0)
  assert(hc.DeviceRequests == null || hc.DeviceRequests.length === 0); assert.equal(hc.PidMode, ''); assert.equal(hc.IpcMode, 'private')
  assert.equal(hc.AutoRemove, false); assert(hc.RestartPolicy !== null && typeof hc.RestartPolicy === 'object')
  assert(['', 'no'].includes(hc.RestartPolicy.Name))
  assert.deepEqual(hc.Tmpfs, { '/tmp': isolatedPythonPolicy.tmpfs })
  assert.deepEqual(hc.LogConfig, { Type: 'local', Config: { 'max-size': '64k', 'max-file': '1', compress: 'false' } })
  assert(Array.isArray(config.Env) && config.Env.every((entry: unknown) => typeof entry === 'string'
    && ['PATH=', 'LANG=', 'PYTHON_VERSION=', 'PYTHON_SHA256=', 'GPG_KEY=', 'HOME=', 'TMPDIR=', 'PYTHONDONTWRITEBYTECODE='].some(prefix => entry.startsWith(prefix))))
}

export interface IsolatedPythonCliConfig {
  readonly cliPath: string
  readonly endpoint: string
  readonly imageRef: string
  readonly imageId: string
  readonly workRoot: string
  readonly timeoutMs?: number
}
export type IsolatedPythonCliOutcome = { readonly status: 'unverifiable'; readonly detail: string; readonly receiptDigest?: string }
  | { readonly status: 'completed'; readonly stdout: string; readonly stderr: string; readonly exitCode: number; readonly receiptDigest: string }
export interface PreparedIsolatedPythonCli {
  readonly digest: string
  readonly run: (source: string, input: string, signal: AbortSignal) => Promise<IsolatedPythonCliOutcome>
}

/** Opt-in trusted host executor. Never starts the engine, pulls an image or mounts project files. */
export async function prepareIsolatedPythonCli(raw: IsolatedPythonCliConfig, signal: AbortSignal): Promise<PreparedIsolatedPythonCli> {
  const config = structuredClone(raw), timeout = config.timeoutMs ?? isolatedPythonPolicy.maxTimeoutMs
  assert(isAbsolute(config.cliPath) && lstatSync(config.cliPath).isFile()); assert(isAbsolute(config.workRoot))
  assert(/^python@sha256:[a-f0-9]{64}$/u.test(config.imageRef)); assert(/^sha256:[a-f0-9]{64}$/u.test(config.imageId))
  assert(/^(?:npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9_-]+|unix:\/\/\/[^\0]+)$/u.test(config.endpoint))
  assert(Number.isInteger(timeout) && timeout >= 100 && timeout <= isolatedPythonPolicy.maxTimeoutMs)
  const root = resolve(config.workRoot)
  if (process.platform === 'win32') assert(/^D:\/DevData\//iu.test(root.replaceAll('\\', '/')))
  mkdirSync(root, { recursive: true }); assert(!lstatSync(root).isSymbolicLink())
  assert.equal(realpathSync(root).toLowerCase(), root.toLowerCase())
  const dockerConfig = resolve(root, 'docker-config'); mkdirSync(dockerConfig, { recursive: true }); assert(!lstatSync(dockerConfig).isSymbolicLink())
  const unknownCleanup = resolve(root, 'unknown-cleanup.json')
  assert(!existsSync(unknownCleanup), 'Unknown cleanup must be resolved before preparing more checks')
  const cliHash = hash(readFileSync(config.cliPath))
  const env = Object.fromEntries(['SYSTEMROOT', 'WINDIR'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []))
  const intact = () => {
    assert.equal(hash(readFileSync(modulePath)), moduleHash); assert.equal(hash(readFileSync(config.cliPath)), cliHash)
    assert.equal(realpathSync(dockerConfig).toLowerCase(), dockerConfig.toLowerCase())
    assert.equal(readdirSync(dockerConfig).length, 0, 'Docker config must remain empty and credential-free')
  }
  const command = async (args: string[], options: { input?: string; signal?: AbortSignal; timeout?: number; limit?: number } = {}) => {
    intact()
    const pending = execute(config.cliPath, ['--config', dockerConfig, '--host', config.endpoint, ...args], {
      env, encoding: 'buffer', windowsHide: true, timeout: options.timeout ?? 20000, maxBuffer: options.limit ?? 1048576,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    if (options.input !== undefined) pending.child.stdin?.end(options.input)
    return pending
  }
  signal.throwIfAborted()
  const image = JSON.parse((await command(['image', 'inspect', config.imageRef], { signal })).stdout.toString())[0] as Row
  assert.equal(image.Id, config.imageId); assert(image.RepoDigests.includes(config.imageRef)); assert.equal(image.Os, 'linux'); assert.equal(image.Architecture, 'amd64')
  const digest = hash(JSON.stringify({ moduleHash, cliHash, config, policy: isolatedPythonPolicy }))
  let poisoned = false
  return { digest, async run(source, input, currentSignal) {
    currentSignal.throwIfAborted()
    if (poisoned || existsSync(unknownCleanup)) return { status: 'unverifiable', detail: 'Previous container cleanup unknown; executor stopped.' }
    assert(Buffer.byteLength(source) <= isolatedPythonPolicy.sourceBytes && Buffer.byteLength(input) <= isolatedPythonPolicy.ioBytes)
    const name = `tianwen-cli-${randomUUID()}`, label = hash(JSON.stringify({ digest, name, source: hash(source), input: hash(input) }))
    let id: string | undefined, attempted = false, removed = false, recoveredByName = false, boundaryVerified = false
    let output: { stdout: Buffer; stderr: Buffer; code: unknown; interrupted: boolean } | undefined, state: Row | undefined, failure: string | undefined
    const owned = (row: Row) => {
      assert.equal(row.Name, `/${name}`); assert.equal(row.Config.Labels['tianwen.isolated-cli'], label); assert.equal(row.Image, config.imageId)
      assert.match(row.Id, /^[a-f0-9]{64}$/u)
    }
    try {
      attempted = true
      id = (await command(['create', '--pull', 'never', '--interactive', '--name', name, '--label', `tianwen.isolated-cli=${label}`,
        '--network', 'none', '--read-only', '--user', '65532:65532', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--cpus', '0.5', '--memory', '128m', '--memory-swap', '128m', '--pids-limit', '32', '--ipc', 'private',
        '--tmpfs', `/tmp:${isolatedPythonPolicy.tmpfs}`, '--log-driver', 'local', '--log-opt', 'max-size=64k', '--log-opt', 'max-file=1', '--log-opt', 'compress=false',
        '--workdir', '/tmp', '--env', 'HOME=/tmp', '--env', 'TMPDIR=/tmp', '--env', 'PYTHONDONTWRITEBYTECODE=1',
        config.imageRef, 'python3', '-I', '-S', '-B', '-c', source])).stdout.toString().trim()
      assert.match(id, /^[a-f0-9]{64}$/u)
      const container = JSON.parse((await command(['inspect', id])).stdout.toString())[0]
      validateIsolatedPythonContainer(container, { name, label, imageId: config.imageId, source }); boundaryVerified = true
      currentSignal.throwIfAborted()
      try {
        const actual = await command(['start', '--attach', '--interactive', id], { input, signal: currentSignal, timeout, limit: isolatedPythonPolicy.ioBytes })
        output = { stdout: actual.stdout, stderr: actual.stderr, code: 0, interrupted: false }
      } catch (error) {
        const row = error as Row
        output = { stdout: Buffer.isBuffer(row.stdout) ? row.stdout : Buffer.alloc(0), stderr: Buffer.isBuffer(row.stderr) ? row.stderr : Buffer.alloc(0),
          code: row.code, interrupted: row.killed === true || row.name === 'AbortError' || row.signal != null }
      }
      state = JSON.parse((await command(['inspect', id])).stdout.toString())[0].State
    } catch (error) { failure = error instanceof Error ? error.message.slice(0, 500) : 'Isolated execution unavailable' }
    finally {
      if (id === undefined && attempted) {
        try { const row = JSON.parse((await command(['inspect', name])).stdout.toString())[0]; owned(row); id = row.Id; recoveredByName = true }
        catch { poisoned = true }
      }
      if (id !== undefined) {
        try {
          owned(JSON.parse((await command(['inspect', id])).stdout.toString())[0])
          assert.equal((await command(['rm', '--force', id])).stdout.toString().trim(), id)
          assert.equal((await command(['ps', '--all', '--quiet', '--no-trunc', '--filter', `id=${id}`])).stdout.toString().trim(), '')
          removed = true
        } catch { poisoned = true }
      }
    }
    if (poisoned && !existsSync(unknownCleanup)) writeFileSync(unknownCleanup, JSON.stringify({ name, label, id, imageId: config.imageId }), { flag: 'wx' })
    const validOutput = output !== undefined && output.stdout.length + output.stderr.length <= isolatedPythonPolicy.ioBytes
      && isUtf8(output.stdout) && isUtf8(output.stderr)
    const receipt = { name, label, executorDigest: digest, sourceDigest: hash(source), inputDigest: hash(input), imageId: config.imageId,
      boundaryVerified, removed, recoveredByName, failure, state: state === undefined ? null : { status: state.Status, exitCode: state.ExitCode, oom: state.OOMKilled },
      output: output === undefined ? null : { stdoutDigest: hash(output.stdout), stderrDigest: hash(output.stderr), transportCode: output.code, interrupted: output.interrupted,
        ...(validOutput ? { stdout: output.stdout.toString('utf8'), stderr: output.stderr.toString('utf8') } : {}) } }
    const receiptJson = JSON.stringify(receipt); writeFileSync(resolve(root, `${name}.json`), receiptJson, { flag: 'wx' })
    currentSignal.throwIfAborted()
    const receiptDigest = hash(receiptJson)
    if (failure !== undefined || !removed || !boundaryVerified || output === undefined || output.interrupted
      || state?.Status !== 'exited' || state.OOMKilled !== false || state.Error !== '' || output.code !== state.ExitCode
      || !validOutput) return { status: 'unverifiable', detail: 'Isolation, transport, resources or cleanup prevented a complete result.', receiptDigest }
    return { status: 'completed', stdout: output.stdout.toString('utf8'), stderr: output.stderr.toString('utf8'), exitCode: state.ExitCode as number, receiptDigest }
  } }
}
