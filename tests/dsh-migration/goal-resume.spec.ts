import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import {
  SessionId,
  mountGoalHarness,
} from '@tianwen/dsh-compat'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-goal-resume-tests')
const CLI = resolve('packages/tianwen-runtime-bundle/dist/cli.js')

function snapshotTree(root: string): Record<string, string> {
  const snapshot: Record<string, string> = {}
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) {
        snapshot[relative(root, path).replaceAll('\\', '/')] = readFileSync(path).toString('base64')
      }
    }
  }
  visit(root)
  return snapshot
}

function sessionLog(dataDir: string, sessionId: string): string {
  const root = join(dataDir, 'dsh-home', 'sessions')
  const candidates: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) candidates.push(path)
    }
  }
  visit(root)
  return candidates.find(path => readFileSync(path, 'utf8').includes(sessionId))!
}

async function persistGoal(
  dataDir: string,
  sessionId: string,
  phase: 'active' | 'paused' | 'blocked' | 'complete' = 'active',
) {
  const harness = await mountGoalHarness(
    join(dataDir, 'dsh-home', 'sessions'), [], { goalRoundDriver: false },
  )
  const handle = await harness.ctx.agents.create({
    sessionId: SessionId(sessionId),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  try {
    let goal = harness.ctx.goals.create(handle.agent, {
      objective: `persist ${sessionId}`, maxGoalRounds: 1,
    })
    if (phase === 'paused') goal = harness.ctx.goals.pause(handle.agent, goal)
    if (phase === 'blocked') {
      goal = harness.ctx.goals.block(handle.agent, goal, {
        code: 'needs-input', message: 'needs input',
      })
    }
    if (phase === 'complete') goal = harness.ctx.goals.complete(handle.agent, goal)
    await harness.ctx.sessions.flush(handle.agent.session)
    return { goalId: String(goal.id), revision: goal.revision, sessionId }
  } finally {
    await handle.dispose()
    await harness.ctx.fiber.dispose()
  }
}

describe('tianwen resume', () => {
  it('resolves DSH only from the installed data-directory host', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'host-'))
    const packageRoot = join(
      dataDir, 'dsh-host', 'node_modules', '@deepseek-ai', 'dsh',
    )
    const bin = join(packageRoot, 'lib', 'bin.js')
    try {
      mkdirSync(join(packageRoot, 'lib'), { recursive: true })
      writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify({
        name: '@deepseek-ai/dsh',
        version: '0.1.0-rc.6',
        bin: { dsh: 'lib/bin.js' },
      })}\n`)
      writeFileSync(bin, '')

      const { resolveInstalledDshBin } = await import(
        '../../packages/tianwen-runtime-bundle/src/resume.js'
      )
      expect(resolveInstalledDshBin(dataDir)).toBe(bin)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('rejects a missing Goal before loading a Profile', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'missing-'))
    try {
      const before = snapshotTree(dataDir)
      const result = spawnSync(process.execPath, [
        CLI, 'resume', '--goal', 'missing', '--data-dir', dataDir,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

      expect(result.status).toBe(3)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe('Goal not found: missing\n')
      expect(snapshotTree(dataDir)).toEqual(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it.each(['active', 'paused', 'blocked'] as const)(
    'returns exact %s Goal and Session authority without changing data',
    async phase => {
      mkdirSync(FIXTURE_BASE, { recursive: true })
      const dataDir = mkdtempSync(join(FIXTURE_BASE, `${phase}-`))
      try {
        const fixture = await persistGoal(dataDir, `resume-${phase}`, phase)
        const before = snapshotTree(dataDir)
        const { preflightGoalResume } = await import(
          '../../packages/tianwen-runtime-bundle/src/resume.js'
        )

        await expect(preflightGoalResume(fixture.goalId, dataDir)).resolves.toEqual({
          dataDir,
          evolutionRoot: join(dataDir, 'state', 'evolution'),
          goalId: fixture.goalId,
          revision: fixture.revision,
          sessionId: fixture.sessionId,
          sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
        })
        expect(snapshotTree(dataDir)).toEqual(before)
      } finally {
        rmSync(dataDir, { recursive: true, force: true })
      }
    },
  )

  it('rejects a stale preflight before appending a Goal mutation', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'stale-'))
    const harness = await mountGoalHarness(
      join(dataDir, 'dsh-home', 'sessions'), [], { goalRoundDriver: false },
    )
    const sessionId = SessionId('resume-stale')
    const handle = await harness.ctx.agents.create({
      sessionId,
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    let disposed = false
    try {
      harness.ctx.provide('agentDefaultModel', {
        currentSelection: () => ({ provider: 'tianwen-probe', model: 'scripted' }),
      })
      const goal = harness.ctx.goals.create(handle.agent, {
        objective: 'reject stale resume authority', maxGoalRounds: 1,
      })
      await harness.ctx.sessions.flush(handle.agent.session)
      await handle.dispose()
      disposed = true
      const restored = await harness.ctx.agents.resume({
        resumeSessionId: sessionId,
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      try {
        expect(harness.ctx.goals.get(restored.agent)?.activation).toBe('disarmed')
        await harness.ctx.sessions.flush(restored.agent.session)
      } finally {
        await restored.dispose()
      }
      const beforeEvents = (await harness.ctx.sessionPersistence.inspect(sessionId))
        .events.length

      const { runGoalResume } = await import(
        '../../packages/tianwen-runtime-bundle/src/resume-runner.js'
      )
      await expect(runGoalResume(harness.ctx, {
        goalId: String(goal.id),
        json: true,
        nonce: 'test-nonce',
        revision: goal.revision + 1,
        sessionId: String(sessionId),
      })).rejects.toThrow('Goal changed after preflight')

      expect((await harness.ctx.sessionPersistence.inspect(sessionId)).events)
        .toHaveLength(beforeEvents)
      expect(harness.adapter.requests).toHaveLength(0)
    } finally {
      if (!disposed) await handle.dispose()
      await harness.ctx.fiber.dispose()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('reports a model failure after retaining the accepted resume history', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'model-failure-'))
    const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
    const sessionId = SessionId('resume-model-failure')
    const first = await mountGoalHarness(sessionsRoot, [], { goalRoundDriver: false })
    const initial = await first.ctx.agents.create({
      sessionId,
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const goal = first.ctx.goals.create(initial.agent, {
        objective: 'retain an accepted resume failure', maxGoalRounds: 2,
      })
      await first.ctx.sessions.flush(initial.agent.session)
      await initial.dispose()
      await first.ctx.fiber.dispose()

      const second = await mountGoalHarness(
        sessionsRoot, [new Error('model offline')], { goalRoundDriver: true },
      )
      try {
        second.ctx.provide('agentDefaultModel', {
          currentSelection: () => ({ provider: 'tianwen-probe', model: 'scripted' }),
        })
        const { runGoalResume } = await import(
          '../../packages/tianwen-runtime-bundle/src/resume-runner.js'
        )
        await expect(runGoalResume(second.ctx, {
          goalId: String(goal.id),
          json: true,
          nonce: 'test-nonce',
          revision: goal.revision,
          sessionId: String(sessionId),
        })).rejects.toThrow('Goal resume did not settle')

        expect(second.adapter.requests).toHaveLength(1)
        const inspection = await second.ctx.sessionPersistence.inspect(sessionId)
        expect(inspection.events.filter(event =>
          event.type === 'goal/change' && event.data.operation === 'resume'))
          .toHaveLength(1)
      } finally {
        await second.ctx.fiber.dispose()
      }
    } finally {
      await first.ctx.fiber.dispose()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('rejects a complete Goal without changing durable data', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'complete-'))
    try {
      const fixture = await persistGoal(dataDir, 'resume-complete', 'complete')
      const before = snapshotTree(dataDir)
      const { preflightGoalResume } = await import(
        '../../packages/tianwen-runtime-bundle/src/resume.js'
      )
      await expect(preflightGoalResume(fixture.goalId, dataDir))
        .rejects.toThrow('Goal is complete')
      expect(snapshotTree(dataDir)).toEqual(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('rejects a duplicate Goal without changing durable data', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'duplicate-'))
    try {
      const first = await persistGoal(dataDir, 'resume-duplicate-a')
      const second = await persistGoal(dataDir, 'resume-duplicate-b')
      const path = sessionLog(dataDir, second.sessionId)
      writeFileSync(path, readFileSync(path, 'utf8').replaceAll(second.goalId, first.goalId))
      const before = snapshotTree(dataDir)
      const { preflightGoalResume } = await import(
        '../../packages/tianwen-runtime-bundle/src/resume.js'
      )
      await expect(preflightGoalResume(first.goalId, dataDir))
        .rejects.toThrow('Goal is present in more than one Session')
      expect(snapshotTree(dataDir)).toEqual(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('rejects corrupt Goal data without changing durable data', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'corrupt-'))
    try {
      const fixture = await persistGoal(dataDir, 'resume-corrupt')
      const path = sessionLog(dataDir, fixture.sessionId)
      const records = readFileSync(path, 'utf8').trimEnd().split('\n')
        .map(line => JSON.parse(line) as { type: string, data: Record<string, unknown> })
      delete records.find(record => record.type === 'goal/change')!.data.updatedAt
      writeFileSync(path, `${records.map(record => JSON.stringify(record)).join('\n')}\n`)
      const before = snapshotTree(dataDir)
      const { preflightGoalResume } = await import(
        '../../packages/tianwen-runtime-bundle/src/resume.js'
      )
      await expect(preflightGoalResume(fixture.goalId, dataDir)).rejects.toThrow()
      expect(snapshotTree(dataDir)).toEqual(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('resumes exactly one durable Goal and waits for its disarmed settlement', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'settle-'))
    const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
    const sessionId = SessionId('resume-settle')
    const first = await mountGoalHarness(sessionsRoot, [], { goalRoundDriver: false })
    const initial = await first.ctx.agents.create({
      sessionId,
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const goal = first.ctx.goals.create(initial.agent, {
        objective: 'finish one resumed Goal round', maxGoalRounds: 1,
      })
      await first.ctx.sessions.flush(initial.agent.session)
      await initial.dispose()
      await first.ctx.fiber.dispose()

      const second = await mountGoalHarness(
        sessionsRoot, [
          [
            { type: 'block-start', index: 0, blockType: 'text' },
            { type: 'block-end', index: 0, block: { type: 'text', text: 'round complete' } },
            { type: 'finish', reason: { kind: 'stop' } },
          ],
        ], { goalRoundDriver: true },
      )
      try {
        second.ctx.provide('agentDefaultModel', {
          currentSelection: () => ({ provider: 'tianwen-probe', model: 'scripted' }),
        })
        const { runGoalResume } = await import(
          '../../packages/tianwen-runtime-bundle/src/resume-runner.js'
        )
        const result = await runGoalResume(second.ctx, {
          goalId: String(goal.id),
          json: true,
          nonce: 'test-nonce',
          revision: goal.revision,
          sessionId: String(sessionId),
        })

        expect(result).toMatchObject({
          schemaVersion: 'tianwen.goal-resume.v1',
          goal: {
            id: String(goal.id), revision: 3, phase: 'blocked', roundsStarted: 1,
          },
          session: {
            id: String(sessionId),
            eventCountBefore: expect.any(Number),
            eventCountAfter: expect.any(Number),
            eventCountDelta: expect.any(Number),
            modelRequestsDelta: 1,
          },
        })
        expect(second.adapter.requests).toHaveLength(1)
        const inspection = await second.ctx.sessionPersistence.inspect(sessionId)
        expect(inspection.events.filter(event => event.type === 'goal/change'))
          .toHaveLength(3)
        expect(result.session.eventCountAfter - result.session.eventCountBefore)
          .toBe(result.session.eventCountDelta)
        const { preflightGoalResume } = await import(
          '../../packages/tianwen-runtime-bundle/src/resume.js'
        )
        const before = snapshotTree(dataDir)
        await expect(preflightGoalResume(String(goal.id), dataDir))
          .rejects.toThrow('Goal round budget is exhausted')
        expect(snapshotTree(dataDir)).toEqual(before)
      } finally {
        await second.ctx.fiber.dispose()
      }
    } finally {
      await first.ctx.fiber.dispose()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
