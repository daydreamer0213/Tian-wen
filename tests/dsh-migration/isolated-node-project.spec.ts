import { expect, it } from 'vitest'
import { compileNodeProject, decodeNodeProjectFrame, nodeProjectPolicy } from '../../packages/tianwen-runtime-bundle/src/isolated-node-project.js'

const files = [{ path: 'main.ts', content: "import { n } from './dep.js'; console.log(n)" }, { path: 'dep.ts', content: 'export const n: number = 7' }]
it('converts captured TypeScript dependencies without executing source and unifies aliases', () => {
  const result = compileNodeProject(files, 'main.ts')
  expect(result.entryPath).toBe('main.js')
  expect(result.files.find(f => f.path === 'dep.js')?.content).toContain('export const n = 7')
  expect(result.files.find(f => f.path === 'dep.ts')?.content).toBe(result.files.find(f => f.path === 'dep.js')?.content)
  expect(result.aliases).toEqual({ 'main.ts': 'main.js', 'dep.ts': 'dep.js' })
  expect(compileNodeProject([{ path: 'main.ts', content: "throw new Error('MUST NOT RUN ON HOST')" }], 'main.ts').entryPath).toBe('main.js')
})
it.each([
  [{ path: '../main.js', content: '' }],
  [{ path: 'main.js', content: null }],
  [{ path: 'main.ts', content: 'const = bad' }],
  [{ path: 'main.ts', content: '' }, { path: 'main.js', content: '' }],
  [{ path: 'main.js', content: '' }, { path: 'package.json', content: '{"type":"commonjs"}' }],
  [{ path: 'main.js', content: '' }, { path: '.tianwen-loader.mjs', content: '' }],
  [{ path: 'main.js', content: '' }, { path: 'PACKAGE.JSON', content: '{}' }],
  [{ path: 'main.js', content: '' }, { path: '.TIANWEN-LOADER.MJS/nested.js', content: '' }],
])('rejects unsafe, absent, unconvertible or conflicting captured modules', entries => {
  expect(() => compileNodeProject(entries, entries[0]!.path)).toThrow()
})
it('requires a present runnable entry, exact original byte limits and bounded generated material', () => {
  expect(() => compileNodeProject(files, 'absent.js')).toThrow()
  expect(() => compileNodeProject([{ path: 'main.json', content: '{}' }], 'main.json')).toThrow()
  expect(() => compileNodeProject([{ path: 'main.js', content: ' '.repeat(96 * 1024 + 1) }], 'main.js')).toThrow()
  const hugePath = 'x'.repeat(nodeProjectPolicy.transformedBytes) + '.js'
  expect(() => compileNodeProject([{ path: hugePath, content: '' }], hugePath)).toThrow()
  expect(nodeProjectPolicy.outputBytes).toBe(8192)
})
const binding = { snapshotDigest: 'd'.repeat(64), entryPath: 'main.js' }
const frame = { protocol: 'tianwen.node-project-result.v1', ...binding, status: 'completed', stdout: '{"n":7}', stderr: '', exitCode: 2 }
it('keeps child program failure distinct from transport failure', () => {
  expect(decodeNodeProjectFrame(JSON.stringify(frame), binding)).toEqual({ status: 'completed', stdout: '{"n":7}', stderr: '', exitCode: 2 })
})
it.each([
  { ...frame, snapshotDigest: 'other' }, { ...frame, entryPath: 'other.js' },
  { ...frame, extra: true }, { ...frame, exitCode: null }, { ...frame, exitCode: 256 },
  { ...frame, stdout: ' '.repeat(8193) }, { ...frame, status: 'unverifiable' },
])('declines substituted, incomplete or oversized parent frames', value => {
  expect(() => decodeNodeProjectFrame(JSON.stringify(value), binding)).toThrow()
})
