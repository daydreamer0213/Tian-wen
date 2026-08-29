import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  createTianwenLongGoalRpcHandler,
  resolveTianwenLongGoalHostRoots,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-learn-loop-host-tests')

function createFixtureRoot(): string {
  mkdirSync(FIXTURE_BASE, { recursive: true })
  return mkdtempSync(join(FIXTURE_BASE, 'host-'))
}

describe('Tianwen Long Goal Web host', () => {
  it('resolves profile, configured, and DSH session roots without accepting relative roots', () => {
    const fixture = createFixtureRoot()
    try {
      const profileRoot = join(fixture, 'dsh-home', 'profiles', 'tianwen')
      const roots = resolveTianwenLongGoalHostRoots({
        profileBaseUrl: pathToFileURL(`${profileRoot}/`),
        dshHome: join(fixture, 'dsh-home'),
      })
      expect(roots).toEqual({
        stateRoot: join(profileRoot, 'state'),
        evolutionRoot: join(profileRoot, 'state', 'evolution'),
        sessionsRoot: join(fixture, 'dsh-home', 'sessions'),
      })
      expect(() => resolveTianwenLongGoalHostRoots({
        profileBaseUrl: pathToFileURL(`${profileRoot}/`),
        config: { stateRoot: 'relative' },
      })).toThrow('absolute')
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('lists, creates, and reads status through exact endpoint payloads', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const handler = createTianwenLongGoalRpcHandler({
        stateRoot,
        sessionsRoot: join(fixture, 'sessions'),
        evolutionRoot: join(stateRoot, 'evolution'),
      })
      const signal = AbortSignal.timeout(1_000)

      const result = await handler('list', {}, signal)
      expect(result).toEqual({ ok: true, value: { goals: [] } })

      await expect(handler('create', {
        objective: 'Ship release',
        tasks: ['Prepare notes', 'Publish'],
        maxTaskRounds: 3,
      }, signal)).resolves.toMatchObject({
        ok: true,
        value: { status: { goal: { completedTasks: 0, totalTasks: 2 } } },
      })
      const listed = await handler('list', {}, signal)
      expect(listed).toMatchObject({ ok: true, value: { goals: [{ objective: 'Ship release' }] } })
      const goalId = listed.ok ? listed.value.goals[0]!.id : ''
      await expect(handler('status', { longGoalId: goalId }, signal)).resolves.toMatchObject({
        ok: true,
        value: { status: { goal: { id: goalId, totalTasks: 2 } } },
      })
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('rejects malformed requests without creating a goal file', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const handler = createTianwenLongGoalRpcHandler({
        stateRoot,
        sessionsRoot: join(fixture, 'sessions'),
        evolutionRoot: join(stateRoot, 'evolution'),
      })
      const invalid = { ok: false, error: { code: 'internal', message: 'invalid-request', details: {} } }
      const signal = AbortSignal.timeout(1_000)

      for (const [endpoint, payload] of [
        ['unknown', {}],
        ['list', { ignored: true }],
        ['create', { objective: ' ', tasks: ['Task'], maxTaskRounds: 1 }],
        ['create', { objective: 'Goal', tasks: [], maxTaskRounds: 1 }],
        ['create', { objective: 'Goal', tasks: ['Task'], maxTaskRounds: 0 }],
        ['create', { objective: 'Goal', tasks: ['Task'], maxTaskRounds: 1, ignored: true }],
        ['status', { longGoalId: 'tianwen-long-goal-a', ignored: true }],
      ] as const) {
        await expect(handler(endpoint, payload, signal)).resolves.toEqual(invalid)
      }
      expect(existsSync(join(stateRoot, 'long-goals'))).toBe(false)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
