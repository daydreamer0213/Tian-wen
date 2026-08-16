import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId, mountGoalHarness } from '@tianwen/dsh-compat'

import {
  buildGoalCreateInvocation,
  preflightGoalCreate,
} from '../../packages/tianwen-runtime-bundle/src/create.js'
import { runGoalCreate } from '../../packages/tianwen-runtime-bundle/src/create-runner.js'
import { main } from '../../packages/tianwen-runtime-bundle/src/cli.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-goal-create-tests')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tianwen create', () => {
  it.each([
    ['missing objective', ['create', '--data-dir', 'D:/DevData/tianwen']],
    ['empty objective', ['create', '--objective', '   ', '--data-dir', 'D:/DevData/tianwen']],
    ['zero rounds', ['create', '--objective', 'build', '--max-rounds', '0', '--data-dir', 'D:/DevData/tianwen']],
    ['fractional rounds', ['create', '--objective', 'build', '--max-rounds', '1.5', '--data-dir', 'D:/DevData/tianwen']],
    ['Goal id', ['create', '--objective', 'build', '--goal', 'forbidden', '--data-dir', 'D:/DevData/tianwen']],
  ])('rejects %s before changing state', async (_label, args) => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'usage-'))
    const actual = args.map(value => value === 'D:/DevData/tianwen' ? dataDir : value)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await expect(main(actual)).resolves.toBe(2)
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('tianwen create'))
      expect(readdirSync(dataDir)).toEqual([])
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('fails missing installed DSH preflight without creating state', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'missing-host-'))
    try {
      expect(() => preflightGoalCreate('build a project', 3, dataDir))
        .toThrow('installed DSH CLI is unavailable')
      expect(readdirSync(dataDir)).toEqual([])
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('builds one fixed shell-free Profile invocation', () => {
    const invocation = buildGoalCreateInvocation({
      dataDir: 'D:\\DevData\\tianwen',
      dshBin: 'D:\\DevData\\tianwen\\dsh-host\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js',
      evolutionRoot: 'D:\\DevData\\tianwen\\state\\evolution',
      maxGoalRounds: 3,
      objective: 'build a project',
      sessionsRoot: 'D:\\DevData\\tianwen\\dsh-home\\sessions',
    }, true, 'b1ec15fd-8d57-4ef4-8ebd-628035a8b825')

    expect(invocation.program).toBe(process.execPath)
    expect(invocation.args).toEqual([
      expect.stringMatching(/dsh[\\/]lib[\\/]bin\.js$/u),
      '--profile',
      'tianwen',
      '--patch',
      expect.stringMatching(/create\.patch\.yml$/u),
    ])
    expect(invocation.options).toMatchObject({ shell: false, stdio: 'inherit' })
    expect(invocation.options.env).toMatchObject({
      DSH_HOME: 'D:\\DevData\\tianwen\\dsh-home',
      TIANWEN_CREATE_EVOLUTION_ROOT: 'D:\\DevData\\tianwen\\state\\evolution',
      TIANWEN_CREATE_JSON: 'true',
      TIANWEN_CREATE_MAX_ROUNDS: '3',
      TIANWEN_CREATE_NONCE: 'b1ec15fd-8d57-4ef4-8ebd-628035a8b825',
      TIANWEN_CREATE_OBJECTIVE: 'build a project',
      TIANWEN_CREATE_SESSIONS_ROOT: 'D:\\DevData\\tianwen\\dsh-home\\sessions',
    })
  })

  it('persists one recoverable Goal without requesting a model', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'runner-'))
    const sessionsRoot = join(dataDir, 'sessions')
    const first = await mountGoalHarness(sessionsRoot, [], { goalRoundDriver: false })
    first.ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'tianwen-probe', model: 'scripted' }),
    })
    try {
      const receipt = await runGoalCreate(first.ctx, {
        json: true,
        maxGoalRounds: 3,
        nonce: 'b1ec15fd-8d57-4ef4-8ebd-628035a8b825',
        objective: 'build a recoverable project',
      })
      expect(receipt).toEqual({
        schemaVersion: 'tianwen.goal-create.v1',
        goal: {
          id: expect.any(String),
          maxGoalRounds: 3,
          objective: 'build a recoverable project',
          phase: 'active',
          revision: 1,
          roundsStarted: 0,
        },
        session: {
          eventCount: expect.any(Number),
          id: 'tianwen-goal-b1ec15fd-8d57-4ef4-8ebd-628035a8b825',
          modelRequestsDelta: 0,
        },
      })
      expect(first.adapter.requests).toHaveLength(0)

      await first.ctx.fiber.dispose()
      const second = await mountGoalHarness(sessionsRoot, [], { goalRoundDriver: false })
      try {
        const handle = await second.ctx.agents.resume({
          resumeSessionId: SessionId(receipt.session.id),
          agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
        })
        try {
          expect(handle.agent.session.header.cwd).toBe(process.cwd())
          expect(second.ctx.goals.get(handle.agent)).toMatchObject({
            id: receipt.goal.id,
            activation: 'disarmed',
            maxGoalRounds: 3,
            objective: 'build a recoverable project',
            revision: 1,
            roundsStarted: 0,
          })
          expect(second.adapter.requests).toHaveLength(0)
        } finally {
          await handle.dispose()
        }
      } finally {
        await second.ctx.fiber.dispose()
      }
    } finally {
      await first.ctx.fiber.dispose()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
