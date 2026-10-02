import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseConversationFileEntries, type ConversationFileEntry } from '@tianwen/evolution'
import { prepareIsolatedJsonCli, isolatedPythonPolicy, type IsolatedPythonCliOutcome } from './isolated-python-cli.js'
import type { IsolatedNodeCliConfig } from './isolated-node-cli.js'

export const nodeProjectPolicy = Object.freeze({ transformedBytes: 256 * 1024, outputBytes: 8192 })
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const modulePath = fileURLToPath(import.meta.url), moduleDigest = hash(readFileSync(modulePath))
const compilerDigest = hash(readFileSync(process.execPath))
const protocol = 'tianwen.node-project-result.v1'
const loaderPath = '.tianwen-loader.mjs'

/** Pure source conversion: never imports or evaluates candidate modules on the host. */
export function compileNodeProject(raw: readonly ConversationFileEntry[], entryPath: string) {
  const original = parseConversationFileEntries(structuredClone(raw))
  assert(original.length > 0 && original.every(file => file.content !== null))
  assert(original.some(file => file.path === entryPath) && /\.(?:m?js|m?ts)$/u.test(entryPath))
  assert(original.every(file => !file.path.toLowerCase().split('/').includes('package.json') && file.path.toLowerCase() !== loaderPath && !file.path.toLowerCase().startsWith(loaderPath + '/')))
  const files: { path: string; content: string }[] = [], aliases: Record<string, string> = {}
  const names = new Set(original.map(file => file.path.toLowerCase()))
  for (const file of original) {
    const typescript = /\.(?:m?ts)$/u.test(file.path)
    const content = typescript ? stripTypeScriptTypes(file.content!, { mode: 'transform' }) : file.content!
    files.push({ path: file.path, content })
    if (typescript) {
      const alias = file.path.replace(/\.mts$/u, '.mjs').replace(/\.ts$/u, '.js')
      assert(!names.has(alias.toLowerCase()) && ![...names].some(name => name.startsWith(alias.toLowerCase() + '/') || alias.toLowerCase().startsWith(name + '/')))
      names.add(alias.toLowerCase()); aliases[file.path] = alias; files.push({ path: alias, content })
    }
  }
  assert(files.reduce((bytes, file) => bytes + Buffer.byteLength(file.content), 0) <= nodeProjectPolicy.transformedBytes)
  // Resolve both original TS imports and emitted JS imports to one canonical module URL.
  const loader = `import {registerHooks} from 'node:module';\nimport {pathToFileURL} from 'node:url';\nconst aliases=${JSON.stringify(aliases)};\nregisterHooks({resolve(specifier,context,nextResolve){const result=nextResolve(specifier,context);const url=new URL(result.url);if(url.protocol==='file:'&&url.pathname.startsWith('/project/')){const key=decodeURIComponent(url.pathname.slice(9));if(Object.hasOwn(aliases,key)){const target=pathToFileURL('/project/'+aliases[key]);target.search=url.search;target.hash=url.hash;return {...result,url:target.href};}}return result;}});\n`
  files.push({ path: 'package.json', content: '{"type":"module"}' }, { path: loaderPath, content: loader })
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  assert(Buffer.byteLength(JSON.stringify(files)) <= nodeProjectPolicy.transformedBytes)
  return { files, aliases, entryPath: aliases[entryPath] ?? entryPath, snapshotDigest: hash(JSON.stringify(files)) }
}

interface FrameBinding { readonly snapshotDigest: string; readonly entryPath: string }
export function decodeNodeProjectFrame(text: string, binding: FrameBinding): { status: 'completed'; stdout: string; stderr: string; exitCode: number } {
  const frame = JSON.parse(text)
  assert(frame !== null && typeof frame === 'object' && !Array.isArray(frame))
  assert.deepEqual(Object.keys(frame).sort(), ['protocol', 'snapshotDigest', 'entryPath', 'status', 'stdout', 'stderr', 'exitCode'].sort())
  assert.equal(frame.protocol, protocol); assert.equal(frame.snapshotDigest, binding.snapshotDigest); assert.equal(frame.entryPath, binding.entryPath)
  assert.equal(frame.status, 'completed'); assert(typeof frame.stdout === 'string' && typeof frame.stderr === 'string')
  assert(Buffer.byteLength(frame.stdout) + Buffer.byteLength(frame.stderr) <= nodeProjectPolicy.outputBytes)
  assert(Number.isInteger(frame.exitCode) && frame.exitCode >= 0 && frame.exitCode <= 255)
  return { status: 'completed', stdout: frame.stdout, stderr: frame.stderr, exitCode: frame.exitCode }
}

const parentSource = `import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {isUtf8} from 'node:buffer';
const request=JSON.parse(readFileSync(0,'utf8'));
const child=spawnSync(process.execPath,['--disable-sigusr1','--import','/project/${loaderPath}','/project/'+request.entryPath],{input:Buffer.from(request.input,'utf8'),cwd:'/project',timeout:request.timeoutMs,maxBuffer:${nodeProjectPolicy.outputBytes}});
const complete=!child.error&&child.signal===null&&Number.isInteger(child.status)&&child.status>=0&&child.status<=255&&Buffer.isBuffer(child.stdout)&&Buffer.isBuffer(child.stderr)&&child.stdout.length+child.stderr.length<=${nodeProjectPolicy.outputBytes}&&isUtf8(child.stdout)&&isUtf8(child.stderr);
console.log(JSON.stringify({protocol:${JSON.stringify(protocol)},snapshotDigest:request.snapshotDigest,entryPath:request.entryPath,status:complete?'completed':'unverifiable',stdout:complete?child.stdout.toString('utf8'):'',stderr:complete?child.stderr.toString('utf8'):'',exitCode:complete?child.status:null}));`

export interface IsolatedNodeProjectInput { readonly files: readonly ConversationFileEntry[]; readonly entryPath: string; readonly input: string }
export type IsolatedNodeProjectOutcome = IsolatedPythonCliOutcome | { readonly status: 'source-rejected'; readonly detail: string }
export interface PreparedIsolatedNodeProject {
  readonly digest: string
  readonly run: (input: IsolatedNodeProjectInput, signal: AbortSignal) => Promise<IsolatedNodeProjectOutcome>
}

/** Fixed opt-in executor; mounts only its small generated read-only snapshot, never the source project. */
export async function prepareIsolatedNodeProject(raw: IsolatedNodeCliConfig, signal: AbortSignal): Promise<PreparedIsolatedNodeProject> {
  const config = structuredClone(raw)
  assert.equal(process.versions.node, '22.23.1', 'Fixed host Node 22.23.1 conversion is required')
  assert.equal(typeof stripTypeScriptTypes, 'function'); assert.equal(stripTypeScriptTypes('export const n: number = 1', { mode: 'transform' }).trim(), 'export const n = 1;')
  const runner = await prepareIsolatedJsonCli(config, signal, 'node-project'), root = resolve(config.workRoot)
  const intact = () => { assert.equal(hash(readFileSync(modulePath)), moduleDigest); assert.equal(hash(readFileSync(process.execPath)), compilerDigest); assert.equal(realpathSync(root), root) }
  const digest = hash(JSON.stringify({ executorDigest: runner.digest, moduleDigest, compilerDigest, compilerVersion: process.versions.node, policy: nodeProjectPolicy, parentSource }))
  return { digest, async run(rawInput, currentSignal) {
    currentSignal.throwIfAborted(); intact()
    const input = structuredClone(rawInput)
    assert(typeof input.input === 'string' && Buffer.byteLength(input.input) <= isolatedPythonPolicy.ioBytes)
    let project: ReturnType<typeof compileNodeProject>
    try { project = compileNodeProject(input.files, input.entryPath) }
    catch { return { status: 'source-rejected', detail: 'Captured source, entry or module aliases cannot form a supported project.' } }
    const request = JSON.stringify({ snapshotDigest: project.snapshotDigest, entryPath: project.entryPath, input: input.input, timeoutMs: config.timeoutMs ?? isolatedPythonPolicy.maxTimeoutMs })
    if (Buffer.byteLength(request) > isolatedPythonPolicy.ioBytes) return { status: 'unverifiable', detail: 'Project input exceeds the bounded transport.' }
    const directory = mkdtempSync(resolve(root, 'snapshot-'))
    const unchanged = () => {
      intact(); assert.equal(realpathSync(directory), directory)
      const walk = (path: string): string[] => readdirSync(path).flatMap(name => {
        const target = resolve(path, name), info = lstatSync(target); assert(!info.isSymbolicLink())
        return info.isDirectory() ? walk(target) : (assert(info.isFile()), [target])
      })
      assert.deepEqual(walk(directory).sort(), project.files.map(file => resolve(directory, file.path)).sort())
      for (const file of project.files) assert.equal(readFileSync(resolve(directory, file.path), 'utf8'), file.content)
    }
    try {
      for (const file of project.files) { const path = resolve(directory, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, file.content, { flag: 'wx' }) }
      unchanged()
      const result = await runner.run(parentSource, request, currentSignal, { directory })
      unchanged()
      if (result.status !== 'completed') return result
      if (result.exitCode !== 0 || result.stderr !== '') return { status: 'unverifiable', detail: 'Trusted parent did not deliver a clean frame.', receiptDigest: result.receiptDigest }
      try { return { ...decodeNodeProjectFrame(result.stdout, project), receiptDigest: result.receiptDigest } }
      catch { return { status: 'unverifiable', detail: 'Child execution, output or frame was incomplete.', receiptDigest: result.receiptDigest } }
    } catch (error) {
      currentSignal.throwIfAborted()
      return { status: 'unverifiable', detail: error instanceof Error ? error.message.slice(0, 500) : 'Project execution unavailable.' }
    } finally {
      // An uncertain live container must retain its snapshot until ownership cleanup is resolved.
      if (!existsSync(resolve(root, 'unknown-cleanup.json'))) {
        assert.equal(realpathSync(directory), directory); assert(directory.startsWith(root + (process.platform === 'win32' ? '\\' : '/')))
        rmSync(directory, { recursive: true })
      }
    }
  } }
}
