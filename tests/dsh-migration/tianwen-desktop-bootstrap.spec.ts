import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  discoverDesktopTargetInputs,
  loadSavedDesktopTarget,
  saveDesktopTarget,
} from '../../packages/tianwen-desktop-host/src/bootstrap.js'
import { resolveDesktopBaseTarget } from '../../packages/tianwen-desktop-host/src/host.js'

const fixtureRoot = resolve('D:/DevData/tianwen-desktop-bootstrap-tests')
const fixtures: string[] = []

function fixture(): { nodeExecutable: string, dshRoot: string, dshHome: string } {
  const root = join(fixtureRoot, randomUUID())
  fixtures.push(root)
  const dshRoot = join(root, 'dsh')
  const dshHome = join(root, 'home')
  mkdirSync(join(dshRoot, 'lib'), { recursive: true })
  mkdirSync(dshHome, { recursive: true })
  writeFileSync(join(dshRoot, 'lib', 'bin.js'), 'export {}\n', 'utf8')
  writeFileSync(join(dshRoot, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh', version: '0.1.1-rc.2', bin: { dsh: 'lib/bin.js' },
  }), 'utf8')
  return { nodeExecutable: process.execPath, dshRoot, dshHome }
}

afterEach(() => {
  while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true })
})

describe('Tianwen Desktop saved target bootstrap', () => {
  it('round-trips only the four-key Desktop target schema', () => {
    const root = fixture()
    const path = join(root.dshHome, 'desktop-target.json')
    const target = resolveDesktopBaseTarget(root)
    saveDesktopTarget(path, target)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      schemaVersion: 'tianwen.desktop-target.v1',
      nodeExecutable: target.nodeExecutable,
      dshRoot: target.dshRoot,
      dshHome: target.dshHome,
    })
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true)
    expect(loadSavedDesktopTarget(path)).toEqual({
      nodeExecutable: target.nodeExecutable,
      dshRoot: target.dshRoot,
      dshHome: target.dshHome,
    })
  })

  it('returns undefined only when saved settings do not exist', () => {
    const path = join(fixture().dshHome, 'desktop-target.json')
    expect(existsSync(path)).toBe(false)
    expect(loadSavedDesktopTarget(path)).toBeUndefined()
  })

  it.each([
    {},
    { schemaVersion: 'wrong', nodeExecutable: 'C:\\node.exe', dshRoot: 'C:\\dsh', dshHome: 'D:\\home' },
    { schemaVersion: 'tianwen.desktop-target.v1', nodeExecutable: 'C:\\node.exe', dshRoot: 'C:\\dsh', dshHome: 'D:\\home', extra: true },
    { schemaVersion: 'tianwen.desktop-target.v1', nodeExecutable: 42, dshRoot: 'C:\\dsh', dshHome: 'D:\\home' },
    '{not json',
  ])('rejects malformed or expanded saved settings: %j', value => {
    const path = join(fixture().dshHome, 'desktop-target.json')
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
    expect(() => loadSavedDesktopTarget(path)).toThrow(/Desktop target settings/u)
  })

  it('discovers targets in command order and de-duplicates exact triples', () => {
    const calls: Array<{ program: string, args: readonly string[] }> = []
    const inputs = discoverDesktopTargetInputs({
      env: { SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\Ada', DSH_HOME: 'D:\\dsh-home' },
      exists: path => !path.endsWith('\\.dsh'),
      run: (program, args) => {
        calls.push({ program, args })
        if (program.endsWith('where.exe')) return 'C:\\Node22\\node.exe\r\nC:\\Node22\\node.exe\r\n'
        if (args.at(-1) === '"npm root -g"') return 'C:\\npm-global\\node_modules\r\n'
        return 'C:\\pnpm-global\\node_modules\r\nC:\\pnpm-global\\node_modules\r\n'
      },
    })
    expect(calls).toEqual([
      { program: 'C:\\Windows\\System32\\where.exe', args: ['node'] },
      { program: 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/s', '/c', '"npm root -g"'] },
      { program: 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/s', '/c', '"pnpm root -g"'] },
    ])
    expect(inputs).toEqual([
      {
        nodeExecutable: 'C:\\Node22\\node.exe',
        dshRoot: 'C:\\npm-global\\node_modules\\@deepseek-ai\\dsh',
        dshHome: 'D:\\dsh-home',
      },
      {
        nodeExecutable: 'C:\\Node22\\node.exe',
        dshRoot: 'C:\\pnpm-global\\node_modules\\@deepseek-ai\\dsh',
        dshHome: 'D:\\dsh-home',
      },
    ])
  })

  it('continues discovery after an individual command fails', () => {
    const inputs = discoverDesktopTargetInputs({
      env: { SystemRoot: 'C:\\Windows', DSH_HOME: 'D:\\dsh-home' },
      run: (program, args) => {
        if (program.endsWith('where.exe')) return 'C:\\Node22\\node.exe\n'
        if (args.at(-1) === '"npm root -g"') throw new Error('npm unavailable')
        return 'C:\\pnpm-global\\node_modules\n'
      },
    })
    expect(inputs).toEqual([{
      nodeExecutable: 'C:\\Node22\\node.exe',
      dshRoot: 'C:\\pnpm-global\\node_modules\\@deepseek-ai\\dsh',
      dshHome: 'D:\\dsh-home',
    }])
  })
})
