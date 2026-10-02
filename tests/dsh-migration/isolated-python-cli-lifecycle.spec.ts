import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareIsolatedPythonCli, isolatedPythonPolicy } from '../../scripts/isolated-python-cli.js'
import { createConversationStudyIsolatedPythonCheck } from '../../scripts/conversation-isolated-python-check.js'
import { conversationExternalInputsDigest, sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { evaluateConversationStudyResultCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'
import { prepareIsolatedNodeCli } from '../../packages/tianwen-runtime-bundle/src/isolated-node-cli.js'
import { createConversationStudyIsolatedNodeCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-isolated-node-check.js'
const state = vi.hoisted(() => ({ mode: 'normal', commands: [] as string[][], row: undefined as Record<string, any> | undefined, controller: undefined as AbortController | undefined,
  cleanupGate: undefined as Promise<void> | undefined, cleanupStarted: undefined as (() => void) | undefined }))
vi.mock('node:child_process', () => {
  const execute = (_file: string, args: string[]) => {
    const command = args.slice(4); state.commands.push(command)
    const value = (text: string) => ({ stdout: Buffer.from(text), stderr: Buffer.alloc(0) })
    const promise = Promise.resolve().then(async () => {
      if (command[0] === 'image') return value(JSON.stringify([{ Id: 'sha256:' + 'b'.repeat(64), RepoDigests: ['python@sha256:' + 'b'.repeat(64), 'node@sha256:' + 'b'.repeat(64)], Os: 'linux', Architecture: 'amd64',
        Config: { Env: [state.mode === 'unsupported-node-version' ? 'NODE_VERSION=22.17.0' : 'NODE_VERSION=22.23.1'] } }]))
      if (command[0] === 'create') {
        if (state.mode === 'unknown-create') throw new Error('transport lost before identity known')
        const option = (name: string) => command[command.indexOf(name) + 1]!
        state.row = { Id: 'a'.repeat(64), Name: '/' + option('--name'), Image: 'sha256:' + 'b'.repeat(64), Mounts: [],
          Config: { User: '65532:65532', OpenStdin: true, Tty: false, WorkingDir: '/tmp', Entrypoint: command.includes('--entrypoint') ? ['node'] : null,
            Labels: { 'tianwen.isolated-cli': option('--label').split('=')[1] }, Env: ['HOME=/tmp'], Cmd: command.includes('--entrypoint') ? command.slice(-3) : ['python3', '-I', '-S', '-B', '-c', command.at(-1)] },
          HostConfig: { NetworkMode: state.mode === 'invalid-boundary' ? 'host' : 'none', ReadonlyRootfs: true, Privileged: false,
            Memory: 134217728, MemorySwap: 134217728, NanoCpus: 500000000, PidsLimit: 32, CapDrop: ['ALL'], CapAdd: null,
            SecurityOpt: ['no-new-privileges'], Binds: null, Devices: [], DeviceRequests: null, PidMode: '', IpcMode: 'private', AutoRemove: false, RestartPolicy: { Name: 'no' },
            Tmpfs: { '/tmp': isolatedPythonPolicy.tmpfs }, LogConfig: { Type: 'local', Config: { 'max-size': '64k', 'max-file': '1', compress: 'false' } } },
          State: { Status: 'exited', ExitCode: state.mode === 'exit-mismatch' ? 2 : 0, OOMKilled: state.mode === 'oom', Error: '' } }
        if (state.mode === 'lost-create') throw new Error('transport lost after creation')
        if (state.mode === 'ownership-mismatch') state.row.Config.Labels['tianwen.isolated-cli'] = 'wrong owner'
        return value('a'.repeat(64) + '\n')
      }
      if (command[0] === 'inspect') { if (state.row === undefined) throw new Error('not found'); return value(JSON.stringify([state.row])) }
      if (command[0] === 'start') {
        if (state.mode === 'cancel') { state.controller!.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }) }
        if (state.mode === 'timeout') throw Object.assign(new Error('timeout'), { killed: true, stdout: Buffer.from('{}'), stderr: Buffer.alloc(0) })
        return value('{}')
      }
      if (command[0] === 'rm') { state.cleanupStarted?.(); await state.cleanupGate; if (state.mode === 'cleanup-failure') throw new Error('daemon cleanup lost'); state.row = undefined; return value('a'.repeat(64)) }
      if (command[0] === 'ps') return value(state.row === undefined ? '' : state.row.Id)
      throw new Error('unexpected command')
    })
    return Object.assign(promise, { child: { stdin: { end: () => {} } } })
  }
  const execFile = Object.assign(() => {}, { [Symbol.for('nodejs.util.promisify.custom')]: execute })
  return { execFile }
})
describe.each(['python', 'javascript', 'typescript'] as const)('fixed %s lifecycle', language => {
const prepare = language === 'python' ? prepareIsolatedPythonCli : (config: Parameters<typeof prepareIsolatedPythonCli>[0], signal: AbortSignal) => prepareIsolatedNodeCli(config, signal, language)
const studyCheck = language === 'python' ? createConversationStudyIsolatedPythonCheck : createConversationStudyIsolatedNodeCheck
const target = language === 'python' ? 'task.py' : language === 'typescript' ? 'task.ts' : 'task.js'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); state.commands = []; state.row = undefined; state.mode = 'normal'; state.controller = undefined; state.cleanupGate = undefined; state.cleanupStarted = undefined })
function config() {
  const base = 'D:/DevData/tianwen-isolated-functional-producer-20261001/test-roots'
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'lifecycle-')); roots.push(root)
  const cliPath = join(root, 'fake-docker'); writeFileSync(cliPath, 'controlled CLI identity; never executed')
  return { cliPath, endpoint: 'unix:///controlled', imageRef: (language === 'python' ? 'python' : 'node') + '@sha256:' + 'b'.repeat(64), imageId: 'sha256:' + 'b'.repeat(64), workRoot: root }
}
it.skipIf(language === 'python')('declines a host image outside the fixed Node version before creating any candidate container', async () => {
  state.mode = 'unsupported-node-version'
  await expect(prepare(config(), new AbortController().signal)).rejects.toThrow()
  expect(state.commands.some(command => command[0] === 'create')).toBe(false)
})
it('finishes only after inspected ownership cleanup and records exact bounded output', async () => {
  const cfg = config(), prepared = await prepare(cfg, new AbortController().signal)
  expect(await prepared.run('print(1)', '{}', new AbortController().signal)).toMatchObject({ status: 'completed', stdout: '{}', stderr: '', exitCode: 0 })
  const receipt = JSON.parse(readFileSync(join(cfg.workRoot, readdirSync(cfg.workRoot).find(name => name.startsWith('tianwen-cli-'))!), 'utf8'))
  expect(receipt).toMatchObject({ boundaryVerified: true, removed: true, output: { stdout: '{}', stderr: '' } })
  expect(state.commands.find(command => command[0] === 'rm')).toEqual(['rm', '--force', 'a'.repeat(64)])
})
it('recovers a lost create response by exact name/label/image and cleans without executing', async () => {
  const cfg = config(), prepared = await prepare(cfg, new AbortController().signal); state.mode = 'lost-create'
  expect((await prepared.run('print(1)', '{}', new AbortController().signal)).status).toBe('unverifiable')
  expect(state.commands.some(command => command[0] === 'start')).toBe(false)
  expect(state.commands.some(command => command[0] === 'rm')).toBe(true)
  expect(existsSync(join(cfg.workRoot, 'unknown-cleanup.json'))).toBe(false)
})
it.each(['unknown-create', 'cleanup-failure', 'ownership-mismatch'] as const)('stops same-root instances and future preparation after %s', async mode => {
  const cfg = config(), signal = new AbortController().signal
  const first = await prepare(cfg, signal), second = await prepare(cfg, signal); state.mode = mode
  expect((await first.run('print(1)', '{}', signal)).status).toBe('unverifiable')
  expect(existsSync(join(cfg.workRoot, 'unknown-cleanup.json'))).toBe(true)
  const count = state.commands.length
  expect((await second.run('print(1)', '{}', signal)).status).toBe('unverifiable'); expect(state.commands).toHaveLength(count)
  await expect(prepare(cfg, signal)).rejects.toThrow(/Unknown cleanup/)
  if (mode === 'ownership-mismatch') expect(state.commands.some(command => command[0] === 'rm')).toBe(false)
})
it.each(['invalid-boundary', 'exit-mismatch', 'oom', 'timeout'] as const)('never completes %s and still removes its owned container', async mode => {
  const prepared = await prepare(config(), new AbortController().signal); state.mode = mode
  expect((await prepared.run('print(1)', '{}', new AbortController().signal)).status).toBe('unverifiable')
  expect(state.row).toBeUndefined()
  if (mode === 'invalid-boundary') expect(state.commands.some(command => command[0] === 'start')).toBe(false)
})
it('cancellation after creation propagates only after owned container cleanup', async () => {
  const prepared = await prepare(config(), new AbortController().signal); state.mode = 'cancel'; state.controller = new AbortController()
  await expect(prepared.run('print(1)', '{}', state.controller.signal)).rejects.toThrow()
  expect(state.row).toBeUndefined(); expect(state.commands.some(command => command[0] === 'rm')).toBe(true)
})
it('pre-cancellation cannot create a container', async () => {
  const prepared = await prepare(config(), new AbortController().signal), controller = new AbortController(); controller.abort()
  await expect(prepared.run('print(1)', '{}', controller.signal)).rejects.toThrow()
  expect(state.commands.some(command => command[0] === 'create')).toBe(false)
})
it('refuses a changed credential-free CLI configuration before candidate execution', async () => {
  const cfg = config(), prepared = await prepare(cfg, new AbortController().signal)
  writeFileSync(join(cfg.workRoot, 'docker-config', 'config.json'), '{}')
  expect((await prepared.run('print(1)', '{}', new AbortController().signal)).status).toBe('unverifiable')
  expect(state.commands.some(command => command[0] === 'create')).toBe(false)
})
it('formal study cancellation waits for the actual runner cleanup before leaving its evaluator', async () => {
  const cfg = config(), signal = new AbortController().signal, condition = 'Return JSON.', files = {
    schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'files' as const, cwd: cfg.workRoot,
    entries: [{ path: target, content: 'print("{}")' }], outputPaths: [target] }
  const material = { prompt: condition, criteria: [condition], files }
  const producer = studyCheck({ cwd: cfg.workRoot, requestText: condition, targetPath: target, isolated: cfg,
    cases: [{ id: 'one', input: '{}', expectedJson: '{}', exitCode: 0 }], requiredCondition: condition, criteria: [condition] })
  const prepared = (await producer.prepare({ ...material, caseId: 'source1', modelConfigDigest: sha256('controlled'), signal }))!
  let release = () => {}, started = () => {}
  state.cleanupGate = new Promise<void>(resolve => { release = resolve })
  const cleaning = new Promise<void>(resolve => { started = resolve }); state.cleanupStarted = started
  state.mode = 'cancel'; state.controller = new AbortController()
  const saved = { checks: [{ caseId: 'source1', checkerId: prepared.checkerId, checkerDigest: prepared.checkerDigest, contractDigest: prepared.contractDigest,
    inputsDigest: conversationExternalInputsDigest(prepared.inputs), requiredCondition: condition }],
    evaluators: new Map([['source1', { material, evaluate: prepared.evaluate,
      ...(prepared.waitsForCancellationCleanup === true ? { waitsForCancellationCleanup: true as const } : {}) }]]) }
  let settled = false
  const pending = evaluateConversationStudyResultCheck(saved, 'source1', { answer: '', files: files.entries }, state.controller.signal)
  pending.catch(() => { settled = true })
  await cleaning; await new Promise(resolve => setTimeout(resolve, 5))
  const endedBeforeCleanup = settled
  release(); await expect(pending).rejects.toThrow()
  expect(endedBeforeCleanup).toBe(false); expect(state.row).toBeUndefined()
})

})
