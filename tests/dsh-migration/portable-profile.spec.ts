import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolvePortableProfileTarget } from '../../packages/tianwen-runtime-bundle/src/portable-profile.js'

const FIXTURE_BASE = process.platform === 'win32'
  ? 'D:/DevData/tianwen-portable-profile-tests'
  : resolve('tmp/tianwen-portable-profile-tests')
const roots: string[] = []

interface TargetFixture {
  readonly dshHome: string
  readonly dshRoot: string
  readonly profile: string
  readonly profileRoot: string
  readonly stateRoot: string
}

function targetFixture(): TargetFixture {
  mkdirSync(FIXTURE_BASE, { recursive: true })
  const root = mkdtempSync(join(FIXTURE_BASE, 'target-'))
  roots.push(root)
  const dshRoot = join(root, 'dsh')
  const dshHome = join(root, 'home')
  const profile = 'existing-profile'
  const profileRoot = join(dshHome, 'profiles', profile)
  const stateRoot = join(root, 'state')
  mkdirSync(join(dshRoot, 'lib'), { recursive: true })
  mkdirSync(profileRoot, { recursive: true })
  writeFileSync(join(dshRoot, 'package.json'), `${JSON.stringify({
    name: '@deepseek-ai/dsh',
    version: '0.1.1-rc.2',
    bin: { dsh: 'lib/bin.js' },
  })}\n`, 'utf8')
  writeFileSync(join(dshRoot, 'lib', 'bin.js'), '#!/usr/bin/env node\n', 'utf8')
  writeFileSync(join(profileRoot, 'package.json'), `${JSON.stringify({
    name: `@deepseek-ai/dsh-profile-${profile}`,
    private: true,
    dsh: { profile: { bundles: [] } },
  })}\n`, 'utf8')
  return { dshHome, dshRoot, profile, profileRoot, stateRoot }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('portable DSH Profile target', () => {
  it('resolves one exact existing Profile without creating Tianwen state', () => {
    const fixture = targetFixture()

    expect(resolvePortableProfileTarget(fixture)).toEqual({
      dshRoot: fixture.dshRoot,
      dshBin: join(fixture.dshRoot, 'lib', 'bin.js'),
      dshHome: fixture.dshHome,
      profile: fixture.profile,
      profileRoot: fixture.profileRoot,
      sessionsRoot: join(fixture.dshHome, 'sessions'),
      stateRoot: fixture.stateRoot,
      evolutionRoot: join(fixture.stateRoot, 'evolution'),
    })
    expect(existsSync(fixture.stateRoot)).toBe(false)
  })

  it.each(['dshRoot', 'dshHome', 'stateRoot'] as const)(
    'rejects a relative %s',
    field => {
      const fixture = targetFixture()
      expect(() => resolvePortableProfileTarget({
        ...fixture,
        [field]: 'relative/path',
      })).toThrow(new RegExp(`${field}.*absolute`, 'u'))
    },
  )

  it.each(['', '-leading', 'UPPER', 'has_underscore', 'has/slash'])(
    'rejects invalid Profile name %j',
    profile => {
      const fixture = targetFixture()
      expect(() => resolvePortableProfileTarget({ ...fixture, profile }))
        .toThrow(/profile.*[a-z0-9]/u)
    },
  )

  it.each([
    ['package name', { name: '@deepseek-ai/not-dsh', version: '0.1.1-rc.2', bin: { dsh: 'lib/bin.js' } }],
    ['package version', { name: '@deepseek-ai/dsh', version: '0.1.0-rc.7', bin: { dsh: 'lib/bin.js' } }],
    ['missing dsh bin', { name: '@deepseek-ai/dsh', version: '0.1.1-rc.2', bin: {} }],
    ['non-string dsh bin', { name: '@deepseek-ai/dsh', version: '0.1.1-rc.2', bin: { dsh: 42 } }],
  ])('rejects an invalid DSH %s', (_label, manifest) => {
    const fixture = targetFixture()
    writeFileSync(
      join(fixture.dshRoot, 'package.json'),
      `${JSON.stringify(manifest)}\n`,
      'utf8',
    )

    expect(() => resolvePortableProfileTarget(fixture))
      .toThrow(/exact @deepseek-ai\/dsh@0\.1\.1-rc\.2/u)
  })

  it('rejects a DSH bin outside the package root', () => {
    const fixture = targetFixture()
    const outsideBin = join(fixture.dshRoot, '..', 'outside.js')
    writeFileSync(outsideBin, '#!/usr/bin/env node\n', 'utf8')
    writeFileSync(join(fixture.dshRoot, 'package.json'), `${JSON.stringify({
      name: '@deepseek-ai/dsh',
      version: '0.1.1-rc.2',
      bin: { dsh: '../outside.js' },
    })}\n`, 'utf8')

    expect(() => resolvePortableProfileTarget(fixture))
      .toThrow(/DSH bin.*inside dshRoot/u)
  })

  it('rejects a package-internal junction that resolves the DSH bin outside', () => {
    const fixture = targetFixture()
    const outsideRoot = join(fixture.dshRoot, '..', 'outside-bin')
    mkdirSync(outsideRoot)
    writeFileSync(join(outsideRoot, 'bin.js'), '#!/usr/bin/env node\n', 'utf8')
    symlinkSync(outsideRoot, join(fixture.dshRoot, 'linked-bin'), 'junction')
    writeFileSync(join(fixture.dshRoot, 'package.json'), `${JSON.stringify({
      name: '@deepseek-ai/dsh',
      version: '0.1.1-rc.2',
      bin: { dsh: 'linked-bin/bin.js' },
    })}\n`, 'utf8')

    expect(() => resolvePortableProfileTarget(fixture))
      .toThrow(/DSH bin.*inside dshRoot/u)
  })

  it('rejects a missing DSH bin file', () => {
    const fixture = targetFixture()
    rmSync(join(fixture.dshRoot, 'lib', 'bin.js'))

    expect(() => resolvePortableProfileTarget(fixture))
      .toThrow(/DSH bin.*file/u)
  })

  it('rejects a missing Profile without creating it', () => {
    const fixture = targetFixture()
    rmSync(fixture.profileRoot, { recursive: true })

    expect(() => resolvePortableProfileTarget(fixture))
      .toThrow(/Profile.*exist/u)
    expect(existsSync(fixture.profileRoot)).toBe(false)
    expect(existsSync(fixture.stateRoot)).toBe(false)
  })

  it('rejects an empty Profile directory before DSH can initialize it', () => {
    const fixture = targetFixture()
    rmSync(join(fixture.profileRoot, 'package.json'))

    expect(() => resolvePortableProfileTarget(fixture))
      .toThrow(/Profile.*package\.json/u)
    expect(existsSync(join(fixture.profileRoot, 'package.json'))).toBe(false)
    expect(existsSync(fixture.stateRoot)).toBe(false)
  })
})
