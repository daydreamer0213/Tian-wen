import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ calls: 0, snapshot: '', gate: undefined as Promise<void> | undefined, unknown: false, root: '' }))
vi.mock('../../packages/tianwen-runtime-bundle/src/isolated-python-cli.js', async importOriginal => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, prepareIsolatedJsonCli: async () => ({ digest: 'fixed-controlled-runner', async run(_source: string, input: string, signal: AbortSignal, snapshot: { directory: string }) {
    state.calls++; state.snapshot = snapshot.directory
    await state.gate
    if (state.unknown) writeFileSync(resolve(state.root, 'unknown-cleanup.json'), '{}')
    signal.throwIfAborted()
    const binding = JSON.parse(input)
    return { status: 'completed', exitCode: 0, stderr: '', receiptDigest: 'receipt', stdout: JSON.stringify({ protocol: 'tianwen.node-project-result.v1', snapshotDigest: binding.snapshotDigest, entryPath: binding.entryPath, status: 'completed', stdout: '{}', stderr: '', exitCode: 0 }) }
  } }) }
})
import { prepareIsolatedNodeProject } from '../../packages/tianwen-runtime-bundle/src/isolated-node-project.js'
const roots: string[] = []
function config() {
  const base = 'D:/DevData/tianwen-node-project-executor-20261003/test-roots'; mkdirSync(base, { recursive: true })
  const workRoot = mkdtempSync(resolve(base, 'lifecycle-')); roots.push(workRoot); state.root = workRoot
  return { cliPath: 'controlled', endpoint: 'controlled', imageRef: 'controlled', imageId: 'controlled', workRoot }
}
const input = { files: [{ path: 'entry.mjs', content: "console.log('{}')" }], entryPath: 'entry.mjs', input: '{}' }
afterEach(() => { for (const root of roots.splice(0)) { expect(root.startsWith('D:\\DevData\\tianwen-node-project-executor-20261003\\test-roots\\')).toBe(true); rmSync(root, { recursive: true }) } state.calls = 0; state.snapshot = ''; state.gate = undefined; state.unknown = false })
it('freezes caller configuration and leaves no project snapshot after complete execution', async () => {
  const cfg = config(), original = cfg.workRoot, signal = new AbortController().signal, runner = await prepareIsolatedNodeProject(cfg, signal)
  cfg.workRoot = 'C:/wrong'
  expect(await runner.run(input, signal)).toMatchObject({ status: 'completed', stdout: '{}', exitCode: 0 })
  expect(state.snapshot.startsWith(original)).toBe(true)
  expect(readdirSync(original)).toEqual([])
})
it('rejects malformed captured source without creating or invoking the isolated run', async () => {
  const cfg = config(), signal = new AbortController().signal, runner = await prepareIsolatedNodeProject(cfg, signal)
  expect((await runner.run({ ...input, files: [{ path: 'entry.ts', content: 'const = invalid' }], entryPath: 'entry.ts' }, signal)).status).toBe('source-rejected')
  expect(state.calls).toBe(0); expect(readdirSync(cfg.workRoot)).toEqual([])
})
it('waits for runner cancellation cleanup before removing the generated snapshot or rejecting', async () => {
  const cfg = config(), controller = new AbortController(), runner = await prepareIsolatedNodeProject(cfg, controller.signal)
  let release = () => {}; state.gate = new Promise<void>(resolve => { release = resolve })
  const pending = runner.run(input, controller.signal); let settled = false; pending.catch(() => { settled = true })
  controller.abort(); await Promise.resolve()
  expect(settled).toBe(false); expect(readdirSync(cfg.workRoot).some(name => name.startsWith('snapshot-'))).toBe(true)
  release(); await expect(pending).rejects.toThrow()
  expect(readdirSync(cfg.workRoot)).toEqual([])
})
it('retains only the small snapshot when the underlying executor reports unknown live-container cleanup', async () => {
  const cfg = config(), signal = new AbortController().signal, runner = await prepareIsolatedNodeProject(cfg, signal); state.unknown = true
  await runner.run(input, signal)
  expect(readdirSync(cfg.workRoot).filter(name => name.startsWith('snapshot-'))).toHaveLength(1)
  expect(readdirSync(cfg.workRoot)).toContain('unknown-cleanup.json')
})
