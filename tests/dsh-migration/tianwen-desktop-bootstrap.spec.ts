import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDesktopBootstrapInteractions,
  discoverDesktopTargetInputs,
  loadSavedDesktopTarget,
  resolveDesktopBootstrapTarget,
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

  it('rejects an unreadable saved settings path instead of treating it as missing', () => {
    const path = `${join(fixture().dshHome, 'desktop-target.json')}\0`
    expect(() => loadSavedDesktopTarget(path)).toThrow(/Desktop target settings/u)
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
        if (args.at(-1) === 'npm root -g') return 'C:\\npm-global\\node_modules\r\n'
        return 'C:\\pnpm-global\\node_modules\r\nC:\\pnpm-global\\node_modules\r\n'
      },
    })
    expect(calls).toEqual([
      { program: 'C:\\Windows\\System32\\where.exe', args: ['node'] },
      { program: 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/s', '/c', 'npm root -g'] },
      { program: 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/s', '/c', 'pnpm root -g'] },
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
        if (args.at(-1) === 'npm root -g') throw new Error('npm unavailable')
        return 'C:\\pnpm-global\\node_modules\n'
      },
    })
    expect(inputs).toEqual([{
      nodeExecutable: 'C:\\Node22\\node.exe',
      dshRoot: 'C:\\pnpm-global\\node_modules\\@deepseek-ai\\dsh',
      dshHome: 'D:\\dsh-home',
    }])
  })

  it.skipIf(process.platform !== 'win32')('discovers the pnpm global root through real cmd.exe arguments', () => {
    const root = fixture()
    const shimDirectory = join(root.dshHome, 'pnpm-shim')
    const sentinelRoot = join(root.dshHome, 'sentinel-global', 'node_modules')
    const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'Path'
    const originalPath = process.env[pathKey]
    const systemDirectory = join(process.env.SystemRoot!, 'System32')
    mkdirSync(shimDirectory, { recursive: true })
    writeFileSync(join(shimDirectory, 'pnpm.cmd'), [
      '@echo off',
      'if not "%~1"=="root" exit /b 1',
      'if not "%~2"=="-g" exit /b 1',
      'if not "%~3"=="" exit /b 1',
      `echo ${sentinelRoot}`,
    ].join('\r\n'), 'utf8')
    process.env[pathKey] = `${shimDirectory};${dirname(process.execPath)};${systemDirectory};${originalPath ?? ''}`
    try {
      const inputs = discoverDesktopTargetInputs({
        env: { SystemRoot: process.env.SystemRoot, DSH_HOME: root.dshHome },
      })
      expect(inputs).toContainEqual(expect.objectContaining({
        dshRoot: join(sentinelRoot, '@deepseek-ai', 'dsh'),
        dshHome: root.dshHome,
      }))
    } finally {
      if (originalPath === undefined) delete process.env[pathKey]
      else process.env[pathKey] = originalPath
    }
  })

  it('uses a complete CLI target without touching settings, discovery, or selection', async () => {
    const input = fixture()
    const expected = resolveDesktopBaseTarget(input)
    const calls: string[] = []
    const result = await resolveDesktopBootstrapTarget([
      '--node', input.nodeExecutable,
      '--dsh-root', input.dshRoot,
      '--dsh-home', input.dshHome,
    ], 'D:\\settings\\desktop-target.json', {
      validateTarget: candidate => {
        calls.push(`validate:${candidate.dshRoot}`)
        return expected
      },
      loadSavedTarget: () => { calls.push('load'); return input },
      discoverTargetInputs: () => { calls.push('discover'); return [input] },
      selectTarget: async () => { calls.push('select'); return input },
      confirmSavedTargetReplacement: async () => { calls.push('confirm'); return true },
      reportSelectedTargetError: async () => { calls.push('report') },
      saveTarget: () => { calls.push('save') },
    })
    expect(result).toEqual(expected)
    expect(calls).toEqual([`validate:${input.dshRoot}`])
  })

  it('returns a valid saved target before discovery or selection', async () => {
    const input = fixture()
    const expected = resolveDesktopBaseTarget(input)
    const calls: string[] = []
    const result = await resolveDesktopBootstrapTarget([], 'D:\\settings\\desktop-target.json', {
      validateTarget: candidate => {
        calls.push(`validate:${candidate.dshRoot}`)
        return expected
      },
      loadSavedTarget: path => { calls.push(`load:${path}`); return input },
      discoverTargetInputs: () => { calls.push('discover'); return [] },
      selectTarget: async () => { calls.push('select'); return undefined },
      confirmSavedTargetReplacement: async () => { calls.push('confirm'); return true },
      reportSelectedTargetError: async () => { calls.push('report') },
      saveTarget: () => { calls.push('save') },
    })
    expect(result).toEqual(expected)
    expect(calls).toEqual([
      'load:D:\\settings\\desktop-target.json',
      `validate:${input.dshRoot}`,
    ])
  })

  it('does not silently discover another DSH after a saved target becomes invalid', async () => {
    let discoveries = 0
    const result = await resolveDesktopBootstrapTarget([], 'D:\\settings\\desktop-target.json', {
      loadSavedTarget: () => ({ nodeExecutable: 'C:\\old-node.exe', dshRoot: 'C:\\old-dsh', dshHome: 'D:\\old-home' }),
      validateTarget: () => { throw new Error('old target invalid') },
      discoverTargetInputs: () => { discoveries += 1; return [] },
      selectTarget: async () => undefined,
      confirmSavedTargetReplacement: async reason => {
        expect(reason).toContain('old target invalid')
        return false
      },
      reportSelectedTargetError: async () => undefined,
      saveTarget: () => { throw new Error('unexpected save') },
    })
    expect(result).toBeUndefined()
    expect(discoveries).toBe(0)
  })

  it.each([
    { label: 'malformed JSON', write: (path: string) => writeFileSync(path, '{not json', 'utf8') },
    { label: 'wrong-schema JSON', write: (path: string) => writeFileSync(path, JSON.stringify({ schemaVersion: 'wrong' }), 'utf8') },
    { label: 'directory settings path', write: (path: string) => mkdirSync(path) },
  ])('requires explicit replacement for a saved target load failure from $label', async ({ write }) => {
    const rejected = fixture()
    const rejectedSettingsPath = join(rejected.dshHome, 'desktop-target.json')
    write(rejectedSettingsPath)
    let rejectedDiscoveries = 0
    const rejectedResult = await resolveDesktopBootstrapTarget([], rejectedSettingsPath, {
      discoverTargetInputs: () => { rejectedDiscoveries += 1; return [] },
      selectTarget: async () => { throw new Error('unexpected selection') },
      confirmSavedTargetReplacement: async reason => {
        expect(reason).toBe('Desktop target settings are invalid')
        return false
      },
      reportSelectedTargetError: async () => undefined,
    })
    expect(rejectedResult).toBeUndefined()
    expect(rejectedDiscoveries).toBe(0)

    const replacement = fixture()
    const accepted = fixture()
    const acceptedSettingsPath = join(accepted.dshHome, 'desktop-target.json')
    write(acceptedSettingsPath)
    let acceptedDiscoveries = 0
    let selectedSuggestion: unknown = 'not selected'
    let saved = 0
    const acceptedResult = await resolveDesktopBootstrapTarget([], acceptedSettingsPath, {
      discoverTargetInputs: () => { acceptedDiscoveries += 1; return [accepted] },
      selectTarget: async suggested => {
        selectedSuggestion = suggested
        return replacement
      },
      confirmSavedTargetReplacement: async reason => {
        expect(reason).toBe('Desktop target settings are invalid')
        return true
      },
      reportSelectedTargetError: async () => undefined,
      saveTarget: () => { saved += 1 },
    })
    expect(acceptedResult).toEqual(resolveDesktopBaseTarget(replacement))
    expect(selectedSuggestion).toBeUndefined()
    expect(acceptedDiscoveries).toBe(0)
    expect(saved).toBe(1)
  })

  it('sends an accepted invalid saved target directly to selection', async () => {
    const replacement = fixture()
    const expected = resolveDesktopBaseTarget(replacement)
    const calls: string[] = []
    const result = await resolveDesktopBootstrapTarget([], 'D:\\settings\\desktop-target.json', {
      validateTarget: candidate => {
        calls.push(`validate:${candidate.dshRoot}`)
        if (candidate.dshRoot === 'C:\\old-dsh') throw new Error('old target invalid')
        return expected
      },
      loadSavedTarget: () => ({ nodeExecutable: 'C:\\old-node.exe', dshRoot: 'C:\\old-dsh', dshHome: 'D:\\old-home' }),
      discoverTargetInputs: () => { calls.push('discover'); return [replacement] },
      selectTarget: async suggested => {
        calls.push(`select:${suggested?.dshRoot}`)
        return replacement
      },
      confirmSavedTargetReplacement: async reason => {
        calls.push(`confirm:${reason}`)
        return true
      },
      reportSelectedTargetError: async () => { calls.push('report') },
      saveTarget: () => { calls.push('save') },
    })
    expect(result).toEqual(expected)
    expect(calls).toEqual([
      'validate:C:\\old-dsh',
      'confirm:old target invalid',
      'select:C:\\old-dsh',
      `validate:${replacement.dshRoot}`,
      'save',
    ])
  })

  it('saves only the first valid automatic target', async () => {
    const invalid = { nodeExecutable: 'C:\\bad-node.exe', dshRoot: 'C:\\bad-dsh', dshHome: 'D:\\bad-home' }
    const valid = fixture()
    const later = fixture()
    const expected = resolveDesktopBaseTarget(valid)
    const calls: string[] = []
    const result = await resolveDesktopBootstrapTarget([], 'D:\\settings\\desktop-target.json', {
      validateTarget: candidate => {
        calls.push(`validate:${candidate.dshRoot}`)
        if (candidate === invalid) throw new Error('automatic candidate invalid')
        return expected
      },
      loadSavedTarget: () => { calls.push('load'); return undefined },
      discoverTargetInputs: () => { calls.push('discover'); return [invalid, valid, later] },
      selectTarget: async () => { calls.push('select'); return undefined },
      confirmSavedTargetReplacement: async () => { calls.push('confirm'); return true },
      reportSelectedTargetError: async () => { calls.push('report') },
      saveTarget: (_path, target) => { calls.push(`save:${target.dshRoot}`) },
    })
    expect(result).toEqual(expected)
    expect(calls).toEqual([
      'load',
      'discover',
      'validate:C:\\bad-dsh',
      `validate:${valid.dshRoot}`,
      `save:${valid.dshRoot}`,
    ])
  })

  it('reports an invalid selected target and retries until a valid replacement is selected', async () => {
    const invalid = { nodeExecutable: 'C:\\bad-node.exe', dshRoot: 'C:\\bad-dsh', dshHome: 'D:\\bad-home' }
    const valid = fixture()
    const expected = resolveDesktopBaseTarget(valid)
    const calls: string[] = []
    const selections = [invalid, valid]
    const result = await resolveDesktopBootstrapTarget([], 'D:\\settings\\desktop-target.json', {
      validateTarget: candidate => {
        calls.push(`validate:${candidate.dshRoot}`)
        if (candidate === invalid) throw new Error('selected target invalid')
        return expected
      },
      loadSavedTarget: () => { calls.push('load'); return undefined },
      discoverTargetInputs: () => { calls.push('discover'); return [] },
      selectTarget: async () => {
        const selection = selections.shift()
        calls.push(`select:${selection?.dshRoot}`)
        return selection
      },
      confirmSavedTargetReplacement: async () => { calls.push('confirm'); return true },
      reportSelectedTargetError: async reason => { calls.push(`report:${reason}`) },
      saveTarget: (_path, target) => { calls.push(`save:${target.dshRoot}`) },
    })
    expect(result).toEqual(expected)
    expect(calls).toEqual([
      'load',
      'discover',
      'select:C:\\bad-dsh',
      'validate:C:\\bad-dsh',
      'report:selected target invalid',
      `select:${valid.dshRoot}`,
      `validate:${valid.dshRoot}`,
      `save:${valid.dshRoot}`,
    ])
  })

  it('returns undefined when a retry selection is cancelled', async () => {
    const invalid = { nodeExecutable: 'C:\\bad-node.exe', dshRoot: 'C:\\bad-dsh', dshHome: 'D:\\bad-home' }
    const calls: string[] = []
    const result = await resolveDesktopBootstrapTarget([], 'D:\\settings\\desktop-target.json', {
      validateTarget: () => { calls.push('validate'); throw new Error('selected target invalid') },
      loadSavedTarget: () => { calls.push('load'); return undefined },
      discoverTargetInputs: () => { calls.push('discover'); return [] },
      selectTarget: async () => {
        const selection = calls.includes('select') ? undefined : invalid
        calls.push('select')
        return selection
      },
      confirmSavedTargetReplacement: async () => { calls.push('confirm'); return true },
      reportSelectedTargetError: async reason => { calls.push(`report:${reason}`) },
      saveTarget: () => { calls.push('save') },
    })
    expect(result).toBeUndefined()
    expect(calls).toEqual(['load', 'discover', 'select', 'validate', 'report:selected target invalid', 'select'])
  })

  it.each([0, 1, 2])('cancels native target selection when dialog %i is cancelled', async cancelledAt => {
    const calls: Array<{ readonly kind: string, readonly options: Electron.OpenDialogOptions }> = []
    const answers = [
      { canceled: cancelledAt === 0, filePaths: ['C:\\Node22\\node.exe'] },
      { canceled: cancelledAt === 1, filePaths: ['C:\\dsh'] },
      { canceled: cancelledAt === 2, filePaths: ['D:\\dsh-home'] },
    ]
    const interactions = createDesktopBootstrapInteractions({
      showOpenDialog: async options => {
        calls.push({ kind: 'open', options })
        return answers.shift()!
      },
      showMessageBox: async () => ({ response: 0, checkboxChecked: false }),
    })
    await expect(interactions.selectTarget({ nodeExecutable: 'C:\\Suggested\\node.exe', dshRoot: 'C:\\Suggested\\dsh', dshHome: 'D:\\Suggested\\home' })).resolves.toBeUndefined()
    expect(calls.map(call => call.options.defaultPath)).toEqual([
      'C:\\Suggested\\node.exe',
      ...(cancelledAt > 0 ? ['C:\\Suggested\\dsh'] : []),
      ...(cancelledAt > 1 ? ['D:\\Suggested\\home'] : []),
    ])
    expect(calls[0]?.options).toMatchObject({ properties: ['openFile'], filters: [{ extensions: ['exe'] }] })
    if (cancelledAt > 0) expect(calls[1]?.options).toMatchObject({ properties: ['openDirectory'] })
    if (cancelledAt > 1) expect(calls[2]?.options).toMatchObject({ properties: ['openDirectory'] })
  })

  it('omits native dialog default paths when no target is suggested', async () => {
    const options: Electron.OpenDialogOptions[] = []
    const interactions = createDesktopBootstrapInteractions({
      showOpenDialog: async dialogOptions => {
        options.push(dialogOptions)
        return { canceled: false, filePaths: ['C:\\Node22\\node.exe', 'C:\\dsh', 'D:\\dsh-home'] }
      },
      showMessageBox: async () => ({ response: 0, checkboxChecked: false }),
    })
    await interactions.selectTarget()
    expect(options).toHaveLength(3)
    for (const dialogOptions of options) expect(dialogOptions).not.toHaveProperty('defaultPath')
  })
})
