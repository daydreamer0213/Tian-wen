import { randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  SessionId,
  createUserMessage,
  defineTool,
  mountGoalHarness,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import {
  GoalStatusAmbiguousError,
  GoalStatusIntegrityError,
  GoalStatusNotFoundError,
  readGoalStatus,
} from '../../packages/tianwen-runtime-bundle/src/status.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-goal-status-tests')
const CLI = resolve('packages/tianwen-runtime-bundle/dist/cli.js')

interface Fixture {
  readonly dataDir: string
  readonly evolutionRoot: string
  readonly goalId: string
  readonly modelRequests: number
  readonly sessionId: string
}

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {}
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        snapshot[`directory:${relative(root, path).replaceAll('\\', '/')}`] = ''
        visit(path)
      } else if (entry.isFile()) {
        snapshot[`file:${relative(root, path).replaceAll('\\', '/')}`] =
          readFileSync(path).toString('base64')
      }
    }
  }
  visit(root)
  return snapshot
}

function jsonlFiles(root: string): string[] {
  const files: string[] = []
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path)
    }
  }
  visit(root)
  return files
}

async function createFixture(options: {
  readonly root?: string
  readonly objective?: string
  readonly withEvidence?: boolean
} = {}): Promise<Fixture> {
  mkdirSync(FIXTURE_BASE, { recursive: true })
  const dataDir = options.root ?? mkdtempSync(join(FIXTURE_BASE, 'status-'))
  const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
  const evolutionRoot = join(dataDir, 'state', 'evolution')
  mkdirSync(sessionsRoot, { recursive: true })
  mkdirSync(evolutionRoot, { recursive: true })
  const script = options.withEvidence === false
    ? []
    : [
      toolCallResponse('private-call', 'echo', {
        text: 'PRIVATE_TOOL_ARGUMENT',
      }),
      textResponse('done'),
    ]
  const harness = await mountGoalHarness(
    sessionsRoot,
    script,
    { goalRoundDriver: false },
  )
  if (options.withEvidence !== false) {
    harness.ctx.tools.register(defineTool({
      name: 'echo',
      description: 'return one fixed value',
      parameters: { text: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        return 'PRIVATE_TOOL_RESULT'
      },
    }))
  }
  const sessionId = SessionId(`goal-status-${randomUUID()}`)
  const handle = await harness.ctx.agents.create({
    sessionId,
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  try {
    const goal = harness.ctx.goals.create(handle.agent, {
      objective: options.objective ?? 'Show durable Tianwen progress',
      maxGoalRounds: 3,
    })
    if (options.withEvidence !== false) {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'PRIVATE_USER_MESSAGE' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
    }
    expect(await harness.ctx.sessions.flush(handle.agent.session)).toBe(true)
    return {
      dataDir,
      evolutionRoot,
      goalId: String(goal.id),
      modelRequests: harness.adapter.requests.length,
      sessionId: String(sessionId),
    }
  } finally {
    await handle.dispose()
    await harness.ctx.fiber.dispose()
  }
}

function addChampion(evolutionRoot: string): {
  readonly artifactId: string
  readonly revision: number
} {
  const ledger = new EvolutionLedger(evolutionRoot, {
    clock: () => '2026-08-16T00:00:00.000Z',
  })
  const artifact = ledger.recordArtifact('export default "champion-v1"')
  ledger.recordEvaluation({
    artifactId: artifact.artifactId,
    receiptDigest: `sha256:${'a'.repeat(64)}`,
    verdict: 'met',
  })
  ledger.recordApproval({
    artifactId: artifact.artifactId,
    authority: 'human',
    approvalId: 'goal-status-approval',
  })
  return ledger.promote(artifact.artifactId)
}

describe('Tianwen read-only Goal status', () => {
  it('prints deterministic text and JSON through the status CLI', async () => {
    const fixture = await createFixture({ withEvidence: false })
    try {
      const text = execFileSync(process.execPath, [
        CLI, 'status', '--goal', fixture.goalId, '--data-dir', fixture.dataDir,
      ], { encoding: 'utf8' })
      expect(text).toBe([
        `Goal ${fixture.goalId} [active]`,
        'Objective: Show durable Tianwen progress',
        'Progress: 0/3 rounds',
        `Session: ${fixture.sessionId} (1 event)`,
        'Evidence: 0 total (0 complete, 0 missing-result)',
        'Champion: none',
        'Runtime: not-loaded; read-only; 0 model requests',
        '',
      ].join('\n'))
      const json = execFileSync(process.execPath, [
        CLI, 'status', '--goal', fixture.goalId, '--data-dir', fixture.dataDir, '--json',
      ], { encoding: 'utf8' })
      expect(JSON.parse(json)).toEqual(expect.objectContaining({
        schemaVersion: 'tianwen.goal-status.v1',
        goal: expect.objectContaining({ id: fixture.goalId }),
      }))
      expect(execFileSync(process.execPath, [
        CLI, 'status', '--goal', fixture.goalId, '--data-dir', fixture.dataDir, '--json',
      ], { encoding: 'utf8' })).toBe(json)
      expect(json.endsWith('\n')).toBe(true)
      expect(json).not.toContain(fixture.dataDir)
    } finally {
      rmSync(fixture.dataDir, { recursive: true, force: true })
    }
  })

  it('uses stable nonzero exits for usage and not-found CLI errors', () => {
    for (const [args, exit, stderr] of [
      [['status'], 2, 'Usage:'],
      [[
        'status', '--goal', 'missing', '--data-dir', FIXTURE_BASE,
      ], 3, 'Goal not found: missing'],
      [[
        'status', '--goal', 'a', '--data-dir', FIXTURE_BASE, '--json', 'extra',
      ], 2, 'Usage:'],
    ] as const) {
      const result = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      expect(result.status).toBe(exit)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain(stderr)
      expect(result.stderr).not.toContain(FIXTURE_BASE)
    }
  })

  it('projects durable Goal, Evidence and Champion without changing one byte', async () => {
    const fixture = await createFixture()
    try {
      const champion = addChampion(fixture.evolutionRoot)
      const before = snapshotTree(fixture.dataDir)
      const first = await readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })
      const second = await readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })

      expect(second).toEqual(first)
      expect(first).toEqual({
        schemaVersion: 'tianwen.goal-status.v1',
        goal: {
          id: fixture.goalId,
          revision: 1,
          objective: 'Show durable Tianwen progress',
          phase: 'active',
          maxGoalRounds: 3,
          roundsStarted: 0,
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
        session: {
          id: fixture.sessionId,
          eventCount: expect.any(Number),
        },
        evidence: {
          total: 1,
          counts: { complete: 1, 'missing-result': 0 },
          items: [{ toolName: 'echo', status: 'complete' }],
        },
        champion,
        runtime: {
          activation: 'not-loaded',
          modelRequests: 0,
          readOnly: true,
        },
      })
      expect(first.session.eventCount).toBeGreaterThan(0)
      expect(fixture.modelRequests).toBe(2)
      const serialized = JSON.stringify(first)
      expect(serialized).not.toContain('PRIVATE_USER_MESSAGE')
      expect(serialized).not.toContain('PRIVATE_TOOL_ARGUMENT')
      expect(serialized).not.toContain('PRIVATE_TOOL_RESULT')
      expect(serialized).not.toContain(fixture.dataDir)
      expect(snapshotTree(fixture.dataDir)).toEqual(before)
    } finally {
      rmSync(fixture.dataDir, { recursive: true, force: true })
    }
  })

  it('returns a stable not-found error without creating state', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'missing-'))
    try {
      mkdirSync(join(dataDir, 'dsh-home', 'sessions'), { recursive: true })
      const before = snapshotTree(dataDir)
      await expect(readGoalStatus({
        goalId: 'goal-does-not-exist',
        dataDir,
      })).rejects.toBeInstanceOf(GoalStatusNotFoundError)
      expect(snapshotTree(dataDir)).toEqual(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('fails when two durable Sessions claim the same current Goal', async () => {
    const first = await createFixture({ withEvidence: false })
    try {
      const second = await createFixture({
        root: first.dataDir,
        objective: 'Second durable Goal',
        withEvidence: false,
      })
      const sessionsRoot = join(first.dataDir, 'dsh-home', 'sessions')
      const secondLog = jsonlFiles(sessionsRoot).find(path =>
        readFileSync(path, 'utf8').includes(second.sessionId)
      )
      expect(secondLog).toBeDefined()
      const original = readFileSync(secondLog!, 'utf8')
      expect(original).toContain(second.goalId)
      writeFileSync(secondLog!, original.replaceAll(second.goalId, first.goalId))
      const before = snapshotTree(first.dataDir)

      await expect(readGoalStatus({
        goalId: first.goalId,
        dataDir: first.dataDir,
      })).rejects.toBeInstanceOf(GoalStatusAmbiguousError)
      expect(snapshotTree(first.dataDir)).toEqual(before)
    } finally {
      rmSync(first.dataDir, { recursive: true, force: true })
    }
  })

  it('fails closed for malformed or mismatched Champion authority', async () => {
    const fixture = await createFixture({ withEvidence: false })
    try {
      const ledgerPath = join(fixture.evolutionRoot, 'ledger.jsonl')
      writeFileSync(ledgerPath, '{not-json}\n', 'utf8')
      let before = snapshotTree(fixture.dataDir)
      await expect(readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })).rejects.toBeInstanceOf(GoalStatusIntegrityError)
      expect(snapshotTree(fixture.dataDir)).toEqual(before)

      rmSync(fixture.evolutionRoot, { recursive: true, force: true })
      mkdirSync(fixture.evolutionRoot, { recursive: true })
      const forged = {
        type: 'promoted',
        at: '2026-08-16T00:00:00.000Z',
        artifactId: 'artifact:forged',
        revision: 1,
        receiptDigest: `sha256:${'b'.repeat(64)}`,
        approvalId: 'forged-approval',
      }
      writeFileSync(ledgerPath, `${JSON.stringify(forged)}\n`, 'utf8')
      writeFileSync(
        join(fixture.evolutionRoot, 'champion.json'),
        `${JSON.stringify({
          artifactId: forged.artifactId,
          revision: forged.revision,
        })}\n`,
        'utf8',
      )
      before = snapshotTree(fixture.dataDir)
      await expect(readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })).rejects.toBeInstanceOf(GoalStatusIntegrityError)
      expect(snapshotTree(fixture.dataDir)).toEqual(before)

      rmSync(fixture.evolutionRoot, { recursive: true, force: true })
      mkdirSync(fixture.evolutionRoot, { recursive: true })
      const at = '2026-08-16T00:00:00.000Z'
      const mismatchedArtifactId = `artifact:${'c'.repeat(64)}`
      const receiptDigest = `sha256:${'e'.repeat(64)}`
      const mismatchedEvents = [
        {
          type: 'artifact-recorded',
          at,
          artifact: {
            artifactId: mismatchedArtifactId,
            sourceDigest: `sha256:${'d'.repeat(64)}`,
            createdAt: at,
          },
        },
        {
          type: 'evaluation-recorded',
          at,
          evaluation: {
            artifactId: mismatchedArtifactId,
            receiptDigest,
            verdict: 'met',
          },
        },
        {
          type: 'approval-recorded',
          at,
          approval: {
            artifactId: mismatchedArtifactId,
            authority: 'human',
            approvalId: 'mismatched-approval',
          },
        },
        {
          type: 'promoted',
          at,
          artifactId: mismatchedArtifactId,
          revision: 1,
          receiptDigest,
          approvalId: 'mismatched-approval',
        },
      ]
      writeFileSync(
        ledgerPath,
        `${mismatchedEvents.map(event => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      )
      writeFileSync(
        join(fixture.evolutionRoot, 'champion.json'),
        `${JSON.stringify({
          artifactId: mismatchedArtifactId,
          revision: 1,
        })}\n`,
        'utf8',
      )
      before = snapshotTree(fixture.dataDir)
      await expect(readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })).rejects.toBeInstanceOf(GoalStatusIntegrityError)
      expect(snapshotTree(fixture.dataDir)).toEqual(before)

      rmSync(fixture.evolutionRoot, { recursive: true, force: true })
      mkdirSync(fixture.evolutionRoot, { recursive: true })
      addChampion(fixture.evolutionRoot)
      writeFileSync(
        join(fixture.evolutionRoot, 'champion.json'),
        `${JSON.stringify({ artifactId: 'artifact:wrong', revision: 1 })}\n`,
        'utf8',
      )
      before = snapshotTree(fixture.dataDir)
      await expect(readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })).rejects.toBeInstanceOf(GoalStatusIntegrityError)
      expect(snapshotTree(fixture.dataDir)).toEqual(before)
    } finally {
      rmSync(fixture.dataDir, { recursive: true, force: true })
    }
  })

  it('rejects semantically invalid Champion ledger history', async () => {
    const fixture = await createFixture({ withEvidence: false })
    try {
      const at = '2026-08-16T00:00:00.000Z'
      const artifactId = `artifact:${'f'.repeat(64)}`
      const metReceipt = `sha256:${'a'.repeat(64)}`
      const laterReceipt = `sha256:${'b'.repeat(64)}`
      const ledgerPath = join(fixture.evolutionRoot, 'ledger.jsonl')
      const pointerPath = join(fixture.evolutionRoot, 'champion.json')
      const staleEvaluationEvents = [
        {
          type: 'artifact-recorded',
          at,
          artifact: {
            artifactId,
            sourceDigest: `sha256:${'f'.repeat(64)}`,
            createdAt: at,
          },
        },
        {
          type: 'evaluation-recorded',
          at,
          evaluation: {
            artifactId,
            receiptDigest: metReceipt,
            verdict: 'met',
          },
        },
        {
          type: 'evaluation-recorded',
          at,
          evaluation: {
            artifactId,
            receiptDigest: laterReceipt,
            verdict: 'not_met',
          },
        },
        {
          type: 'approval-recorded',
          at,
          approval: {
            artifactId,
            authority: 'human',
            approvalId: 'stale-evaluation-approval',
          },
        },
        {
          type: 'promoted',
          at,
          artifactId,
          revision: 1,
          receiptDigest: metReceipt,
          approvalId: 'stale-evaluation-approval',
        },
      ]
      writeFileSync(
        ledgerPath,
        `${staleEvaluationEvents.map(event => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      )
      writeFileSync(
        pointerPath,
        `${JSON.stringify({ artifactId, revision: 1 })}\n`,
        'utf8',
      )
      await expect(readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })).rejects.toBeInstanceOf(GoalStatusIntegrityError)

      rmSync(fixture.evolutionRoot, { recursive: true, force: true })
      mkdirSync(fixture.evolutionRoot, { recursive: true })
      const champion = addChampion(fixture.evolutionRoot)
      writeFileSync(
        ledgerPath,
        `${JSON.stringify({
          type: 'runtime-bound',
          at,
          artifactId: champion.artifactId,
          pluginId: '',
          packageId: 'runtime-package',
        })}\n`,
        { encoding: 'utf8', flag: 'a' },
      )
      await expect(readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })).rejects.toBeInstanceOf(GoalStatusIntegrityError)
    } finally {
      rmSync(fixture.dataDir, { recursive: true, force: true })
    }
  })
})
