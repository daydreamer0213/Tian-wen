import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionId, mountGoalHarness } from '@tianwen/dsh-compat'
import { main } from '../../packages/tianwen-runtime-bundle/src/cli.js'
import {
  buildGoalCreateInvocation,
  preflightPortableGoalCreate,
} from '../../packages/tianwen-runtime-bundle/src/create.js'
import {
  buildGoalResumeInvocation,
  preflightPortableGoalResume,
} from '../../packages/tianwen-runtime-bundle/src/resume.js'
import { resolvePortableProfileTarget } from '../../packages/tianwen-runtime-bundle/src/portable-profile.js'

const FIXTURE_BASE = process.platform === 'win32'
  ? 'D:/DevData/tianwen-portable-goal-cli-tests'
  : resolve('tmp/tianwen-portable-goal-cli-tests')
const roots: string[] = []

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {}
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const key = relative(root, path).replaceAll('\\', '/')
      if (entry.isDirectory()) {
        snapshot[`directory:${key}`] = ''
        visit(path)
      } else if (entry.isFile()) {
        snapshot[`file:${key}`] = readFileSync(path).toString('base64')
      }
    }
  }
  visit(root)
  return snapshot
}

function targetFixture() {
  mkdirSync(FIXTURE_BASE, { recursive: true })
  const root = mkdtempSync(join(FIXTURE_BASE, 'target-'))
  roots.push(root)
  const dshRoot = join(root, 'dsh')
  const dshHome = join(root, 'home')
  const profile = 'work'
  const profileRoot = join(dshHome, 'profiles', profile)
  const stateRoot = join(root, 'state')
  const runtimeRoot = join(
    profileRoot, 'node_modules', '@tianwen', 'runtime-bundle',
  )
  mkdirSync(join(dshRoot, 'lib'), { recursive: true })
  mkdirSync(join(runtimeRoot, 'dist'), { recursive: true })
  writeFileSync(join(dshRoot, 'package.json'), `${JSON.stringify({
    name: '@deepseek-ai/dsh',
    version: '0.1.1-rc.2',
    bin: { dsh: 'lib/bin.js' },
  })}\n`, 'utf8')
  writeFileSync(join(dshRoot, 'lib', 'bin.js'), '#!/usr/bin/env node\n', 'utf8')
  writeFileSync(join(profileRoot, 'package.json'), `${JSON.stringify({
    name: `@deepseek-ai/dsh-profile-${profile}`,
    private: true,
    dependencies: { '@tianwen/runtime-bundle': 'file:runtime.tgz' },
    dsh: { profile: { bundles: ['@tianwen/runtime-bundle'] } },
  })}\n`, 'utf8')
  writeFileSync(join(runtimeRoot, 'package.json'), `${JSON.stringify({
    name: '@tianwen/runtime-bundle',
    version: '0.1.6',
    bin: { tianwen: 'dist/cli.js' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  })}\n`, 'utf8')
  writeFileSync(join(runtimeRoot, 'dist', 'cli.js'), '#!/usr/bin/env node\n', 'utf8')
  writeFileSync(join(runtimeRoot, 'cordis.patch.yml'), '- insert: []\n', 'utf8')
  return resolvePortableProfileTarget({
    dshRoot, dshHome, profile, stateRoot,
  })
}

function portableArgs(target: ReturnType<typeof targetFixture>): string[] {
  return [
    '--dsh-root', target.dshRoot,
    '--dsh-home', target.dshHome,
    '--profile', target.profile,
    '--state-root', target.stateRoot,
  ]
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('portable goal CLI target', () => {
  it('lists an existing Profile read-only without starting DSH or creating state', async () => {
    const target = targetFixture()
    const before = snapshotTree(join(target.dshHome, '..'))
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(main(['list', ...portableArgs(target), '--json'])).resolves.toBe(0)

    expect(stderr).not.toHaveBeenCalled()
    expect(stdout).toHaveBeenCalledWith(`${JSON.stringify({
      schemaVersion: 'tianwen.goal-list.v1',
      goals: [],
      runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
    })}\n`)
    expect(snapshotTree(join(target.dshHome, '..'))).toEqual(before)
  })

  it('rejects an incomplete or mixed target mode before changing the Profile', async () => {
    const target = targetFixture()
    const before = snapshotTree(join(target.dshHome, '..'))
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(main([
      'list', '--dsh-home', target.dshHome, '--profile', target.profile,
    ])).resolves.toBe(2)
    await expect(main([
      'list', '--data-dir', target.stateRoot, ...portableArgs(target),
    ])).resolves.toBe(2)

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('tianwen list'))
    expect(snapshotTree(join(target.dshHome, '..'))).toEqual(before)
  })

  it.each(['missing', 'wrong-version'] as const)(
    'rejects a %s Runtime Bundle before reading state or starting DSH',
    async failure => {
      const target = targetFixture()
      const runtimeRoot = join(
        target.profileRoot, 'node_modules', '@tianwen', 'runtime-bundle',
      )
      if (failure === 'missing') {
        rmSync(runtimeRoot, { recursive: true })
      } else {
        const manifestPath = join(runtimeRoot, 'package.json')
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          version: string
        }
        manifest.version = '0.0.0'
        writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
      }
      const before = snapshotTree(join(target.dshHome, '..'))
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      await expect(main([
        'create', '--objective', 'must not start', ...portableArgs(target),
      ])).resolves.toBe(1)

      expect(stderr).toHaveBeenCalledWith(
        'selected Profile must contain exact @tianwen/runtime-bundle@0.1.6\n',
      )
      expect(snapshotTree(join(target.dshHome, '..'))).toEqual(before)
    },
  )

  it('rejects a Runtime Bundle junction that resolves outside the Profile', async () => {
    const target = targetFixture()
    const runtimeRoot = join(
      target.profileRoot, 'node_modules', '@tianwen', 'runtime-bundle',
    )
    const outsideRoot = join(target.dshHome, 'outside-runtime')
    renameSync(runtimeRoot, outsideRoot)
    symlinkSync(outsideRoot, runtimeRoot, 'junction')
    const before = snapshotTree(join(target.dshHome, '..'))
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(main(['list', ...portableArgs(target)])).resolves.toBe(1)

    expect(stderr).toHaveBeenCalledWith(
      'selected Profile must contain exact @tianwen/runtime-bundle@0.1.6\n',
    )
    expect(snapshotTree(join(target.dshHome, '..'))).toEqual(before)
  })

  it('builds one shell-free create invocation for the selected Profile', () => {
    const target = targetFixture()
    const preflight = preflightPortableGoalCreate('build a project', 3, target)
    const invocation = buildGoalCreateInvocation(
      preflight, true, 'b1ec15fd-8d57-4ef4-8ebd-628035a8b825',
    )

    expect(invocation.program).toBe(process.execPath)
    expect(invocation.args).toEqual([
      target.dshBin, '--profile', target.profile, '--patch',
      expect.stringMatching(/create\.patch\.yml$/u),
    ])
    expect(invocation.options).toMatchObject({ shell: false, stdio: 'inherit' })
    expect(invocation.options.env).toMatchObject({
      DSH_HOME: target.dshHome,
      TIANWEN_CREATE_EVOLUTION_ROOT: target.evolutionRoot,
      TIANWEN_CREATE_RESUME_SHELL: process.platform === 'win32'
        ? 'powershell'
        : 'posix',
      TIANWEN_CREATE_RESUME_TARGET: expect.stringContaining(
        `--dsh-root '${target.dshRoot.replaceAll("'", "''")}'`,
      ),
      TIANWEN_CREATE_SESSIONS_ROOT: target.sessionsRoot,
    })
    expect(invocation.options.env).not.toHaveProperty('TIANWEN_CREATE_DATA_DIR')
  })

  it('quotes apostrophes for the shell named by the follow-up command', () => {
    const target = targetFixture()
    const quotedTarget = {
      ...target,
      dshRoot: join(target.dshRoot, "Owner's DSH"),
    }
    const preflight = preflightPortableGoalCreate('build', 1, quotedTarget)

    expect(preflight.resumeShell).toBe(
      process.platform === 'win32' ? 'powershell' : 'posix',
    )
    expect(preflight.resumeTarget).toContain(process.platform === 'win32'
      ? "Owner''s DSH"
      : `Owner'"'"'s DSH`)
  })

  it('preflights and invokes ordinary resume against the selected Profile', async () => {
    const target = targetFixture()
    const harness = await mountGoalHarness(
      target.sessionsRoot, [], { goalRoundDriver: false },
    )
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId('portable-resume'),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const goal = harness.ctx.goals.create(handle.agent, {
        objective: 'resume through portable target', maxGoalRounds: 2,
      })
      await harness.ctx.sessions.flush(handle.agent.session)
      const preflight = await preflightPortableGoalResume(String(goal.id), target)
      const invocation = buildGoalResumeInvocation(
        preflight, true, 'portable-nonce', 123,
      )

      expect(invocation.program).toBe(process.execPath)
      expect(invocation.args).toEqual([
        target.dshBin, '--profile', target.profile, '--patch',
        expect.stringMatching(/resume\.patch\.yml$/u),
      ])
      expect(invocation.options).toMatchObject({ shell: false, stdio: 'inherit' })
      expect(invocation.options.env).toMatchObject({
        DSH_HOME: target.dshHome,
        TIANWEN_RESUME_EVOLUTION_ROOT: target.evolutionRoot,
        TIANWEN_RESUME_SESSIONS_ROOT: target.sessionsRoot,
      })
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('keeps live smoke and natural trial managed-only', async () => {
    const target = targetFixture()
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(main([
      'resume', '--goal', 'goal', ...portableArgs(target), '--live-smoke', '--json',
    ])).resolves.toBe(2)
    await expect(main([
      'resume', '--goal', 'goal', ...portableArgs(target),
      '--trial-manifest', join(target.stateRoot, 'trial.json'), '--json',
    ])).resolves.toBe(2)

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('tianwen resume'))
  })
})
