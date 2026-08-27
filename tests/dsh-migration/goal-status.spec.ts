import { randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
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
  LedgerIntegrityError,
  inspectEvolutionLedger,
} from '../../packages/tianwen-evolution/src/inspection.js'
import {
  GoalStatusAmbiguousError,
  GoalStatusIntegrityError,
  GoalStatusNotFoundError,
  listGoals,
  readGoalStatus,
} from '../../packages/tianwen-runtime-bundle/src/status.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-goal-status-tests')
const CLI = resolve('packages/tianwen-runtime-bundle/dist/cli.js')
const STATUS_BUNDLE = resolve('packages/tianwen-runtime-bundle/dist/status.js')
const STATUS_METAFILE = resolve(
  'packages/tianwen-runtime-bundle/dist/status.meta.json',
)
const DIGEST = (character: string) =>
  `sha256:${character.repeat(64)}` as const
const GOVERNED_PARENT = {
  name: 'goal-status-parent',
  description: 'Verify one Goal status projection',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Goal status parent\n\nProject only durable status facts.',
} as const
const GOVERNED_ACCEPTANCE = {
  source: 'dsh-tool-result',
  toolName: 'read',
  notMetErrorCode: 'FS_NOT_FOUND',
  gapDisposition: 'observe',
} as const

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

function snapshotOptionalTree(root: string): Readonly<Record<string, string>> {
  return existsSync(root) ? snapshotTree(root) : {}
}

function seedPrivateNaturalRun(
  evolutionRoot: string,
  interleave?: (ledger: EvolutionLedger) => void,
): void {
  const ledger = new EvolutionLedger(evolutionRoot, {
    clock: () => '2026-08-22T00:00:00.000Z',
  })
  const sessionId = 'session:goal-status-private-run'
  const run = ledger.recordRunBinding({
    goalRef: 'goal:goal-status-private-run',
    taskRef: 'task:goal-status-private-run',
    sessionId,
    scopeKey: 'project:tianwen/capability:goal-status',
    acceptanceContract: GOVERNED_ACCEPTANCE,
  })
  const manifest = ledger.recordRunSkillManifest({
    runId: run.runId,
    skill: GOVERNED_PARENT,
  })
  interleave?.(ledger)
  const sessionDigest = DIGEST('1')
  const acceptanceEvidenceId = DIGEST('2')
  ledger.recordOutcomeIntake({
    runId: run.runId,
    verdict: 'met',
    sessionDigest,
    evidenceIds: [acceptanceEvidenceId],
  })
  ledger.recordRunSkillUse({
    runId: run.runId,
    parentVersionId: manifest.parentVersionId,
    sessionId,
    sessionDigest,
    skillName: GOVERNED_PARENT.name,
    contentDigest: ledger.getRunSkillManifest(run.runId)!.contentDigest,
    skillEvidenceId: DIGEST('3'),
    acceptanceEvidenceId,
    skillCallSeq: 1,
    skillResultSeq: 2,
    acceptanceCallSeq: 3,
  })
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

function sessionLog(dataDir: string, sessionId: string): string {
  const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
  const path = jsonlFiles(sessionsRoot).find(candidate => {
    const [header] = readFileSync(candidate, 'utf8').trimEnd().split('\n')
    return (JSON.parse(header!) as { id?: unknown }).id === sessionId
  })
  expect(path).toBeDefined()
  return path!
}

function sessionEventCount(dataDir: string, sessionId: string): number {
  return readFileSync(sessionLog(dataDir, sessionId), 'utf8')
    .trimEnd().split('\n').length - 1
}

function mutateGoalChange(
  fixture: Pick<Fixture, 'dataDir' | 'sessionId'>,
  mutate: (data: Record<string, unknown>) => void,
): void {
  const path = sessionLog(fixture.dataDir, fixture.sessionId)
  const records = readFileSync(path, 'utf8').trimEnd().split('\n')
    .map(line => JSON.parse(line) as Record<string, unknown>)
  const event = records.find(record => record.type === 'goal/change') as
    | { data?: unknown }
    | undefined
  expect(event?.data).toEqual(expect.any(Object))
  mutate(event!.data as Record<string, unknown>)
  writeFileSync(path, `${records.map(record => JSON.stringify(record)).join('\n')}\n`)
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

async function addGoalLessSession(dataDir: string): Promise<string> {
  const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
  mkdirSync(sessionsRoot, { recursive: true })
  const harness = await mountGoalHarness(
    sessionsRoot,
    [textResponse('goal-less session complete')],
    { goalRoundDriver: false },
  )
  const sessionId = SessionId(`goal-less-${randomUUID()}`)
  const handle = await harness.ctx.agents.create({
    sessionId,
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  try {
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'GOAL_LESS_PRIVATE_MESSAGE' }],
      source: { kind: 'user' },
    }))
    await waitForIdle(harness.ctx, handle.agent)
    expect(await harness.ctx.sessions.flush(handle.agent.session)).toBe(true)
    return String(sessionId)
  } finally {
    await handle.dispose()
    await harness.ctx.fiber.dispose()
  }
}

function addChampionToLedger(ledger: EvolutionLedger): {
  readonly artifactId: string
  readonly revision: number
} {
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

function addChampion(evolutionRoot: string): {
  readonly artifactId: string
  readonly revision: number
} {
  return addChampionToLedger(new EvolutionLedger(evolutionRoot, {
    clock: () => '2026-08-16T00:00:00.000Z',
  }))
}

describe('authoritative governed ledger inspection', () => {
  it('replays the four real private natural Run facts without creating artifacts', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const evolutionRoot = mkdtempSync(join(FIXTURE_BASE, 'inspection-private-'))
    try {
      seedPrivateNaturalRun(evolutionRoot)
      const artifactsRoot = join(evolutionRoot, 'artifacts')
      expect(readdirSync(artifactsRoot)).toEqual([])
      rmdirSync(artifactsRoot)
      const before = snapshotTree(evolutionRoot)

      expect(inspectEvolutionLedger(evolutionRoot)).toEqual({ champion: null })
      expect(existsSync(artifactsRoot)).toBe(false)
      expect(snapshotTree(evolutionRoot)).toEqual(before)
      expect(readFileSync(join(evolutionRoot, 'ledger.jsonl'), 'utf8')
        .trimEnd().split('\n').map(line => JSON.parse(line).type)).toEqual([
        'run-binding-recorded',
        'run-skill-manifest-recorded',
        'outcome-intake-recorded',
        'run-skill-use-recorded',
      ])
    } finally {
      rmSync(evolutionRoot, { recursive: true, force: true })
    }
  })

  it('returns null for an absent Evolution root without creating it', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const parent = mkdtempSync(join(FIXTURE_BASE, 'inspection-absent-'))
    const evolutionRoot = join(parent, 'state', 'evolution')
    try {
      const before = snapshotTree(parent)
      expect(inspectEvolutionLedger(evolutionRoot)).toEqual({ champion: null })
      expect(existsSync(evolutionRoot)).toBe(false)
      expect(snapshotTree(parent)).toEqual(before)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('projects one valid legacy Champion without reading or changing its source', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const evolutionRoot = mkdtempSync(join(FIXTURE_BASE, 'inspection-champion-'))
    try {
      const champion = addChampion(evolutionRoot)
      const artifactSource = join(evolutionRoot, 'artifacts',
        `sha256-${champion.artifactId.slice('artifact:'.length)}.mjs`)
      rmSync(artifactSource)
      const before = snapshotTree(evolutionRoot)

      expect(inspectEvolutionLedger(evolutionRoot)).toEqual({ champion })
      expect(snapshotTree(evolutionRoot)).toEqual(before)
    } finally {
      rmSync(evolutionRoot, { recursive: true, force: true })
    }
  })

  it('rejects missing, stale, and mismatched Champion pointers without repair', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    for (const kind of ['missing', 'stale', 'mismatched'] as const) {
      const evolutionRoot = mkdtempSync(join(FIXTURE_BASE, `inspection-${kind}-`))
      try {
        const ledger = new EvolutionLedger(evolutionRoot, {
          clock: () => '2026-08-22T00:00:00.000Z',
        })
        const first = ledger.recordArtifact('export default "first"')
        ledger.recordEvaluation({
          artifactId: first.artifactId,
          receiptDigest: DIGEST('4'),
          verdict: 'met',
        })
        ledger.recordApproval({
          artifactId: first.artifactId,
          authority: 'human',
          approvalId: 'inspection-first',
        })
        const firstPointer = ledger.promote(first.artifactId)
        if (kind === 'stale') {
          const second = ledger.recordArtifact(
            'export default "second"',
            first.artifactId,
          )
          ledger.recordEvaluation({
            artifactId: second.artifactId,
            receiptDigest: DIGEST('5'),
            verdict: 'met',
          })
          ledger.recordApproval({
            artifactId: second.artifactId,
            authority: 'human',
            approvalId: 'inspection-second',
          })
          ledger.promote(second.artifactId)
          writeFileSync(
            join(evolutionRoot, 'champion.json'),
            `${JSON.stringify(firstPointer)}\n`,
          )
        } else if (kind === 'missing') {
          rmSync(join(evolutionRoot, 'champion.json'))
        } else {
          writeFileSync(
            join(evolutionRoot, 'champion.json'),
            `${JSON.stringify({
              artifactId: `artifact:${'f'.repeat(64)}`,
              revision: firstPointer.revision,
            })}\n`,
          )
        }
        const before = snapshotTree(evolutionRoot)
        expect(() => inspectEvolutionLedger(evolutionRoot))
          .toThrow(LedgerIntegrityError)
        expect(snapshotTree(evolutionRoot)).toEqual(before)
      } finally {
        rmSync(evolutionRoot, { recursive: true, force: true })
      }
    }
  })

  it('fails closed for unknown, malformed, and broken private history', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    for (const kind of ['unknown', 'malformed', 'broken-private'] as const) {
      const evolutionRoot = mkdtempSync(join(FIXTURE_BASE, `inspection-${kind}-`))
      try {
        const ledgerPath = join(evolutionRoot, 'ledger.jsonl')
        if (kind === 'unknown') {
          writeFileSync(ledgerPath, `${JSON.stringify({
            type: 'unknown-governed-event',
            at: '2026-08-22T00:00:00.000Z',
          })}\n`)
        } else if (kind === 'malformed') {
          writeFileSync(ledgerPath, '{not-json}\n')
        } else {
          seedPrivateNaturalRun(evolutionRoot)
          const lines = readFileSync(ledgerPath, 'utf8').trimEnd().split('\n')
          writeFileSync(ledgerPath, `${lines.slice(1).join('\n')}\n`)
        }
        const before = snapshotOptionalTree(evolutionRoot)
        expect(() => inspectEvolutionLedger(evolutionRoot))
          .toThrow(LedgerIntegrityError)
        expect(snapshotOptionalTree(evolutionRoot)).toEqual(before)
      } finally {
        rmSync(evolutionRoot, { recursive: true, force: true })
      }
    }
  })
})

describe('Tianwen read-only Goal status', () => {
  it('keeps the status bundle free of private runtime and probe inputs', () => {
    const metafile = JSON.parse(readFileSync(STATUS_METAFILE, 'utf8')) as {
      inputs: Record<string, unknown>
    }
    const inputs = Object.keys(metafile.inputs).join('\n')
    const source = readFileSync(STATUS_BUNDLE, 'utf8')
    for (const forbidden of [
      'scripted-adapter',
      'dsh-tool-skill',
      'runtime-binding',
      'test-harness',
      'dsh-probe',
    ]) {
      expect(inputs).not.toContain(forbidden)
      expect(source).not.toContain(forbidden)
    }
  })

  it('lists only current Goal summaries in deterministic recent-first order', async () => {
    const recent = await createFixture({ objective: 'Recent\nGoal' })
    try {
      const tiedA = await createFixture({
        root: recent.dataDir,
        objective: 'Tied A',
        withEvidence: false,
      })
      const tiedB = await createFixture({
        root: recent.dataDir,
        objective: 'Tied B',
        withEvidence: false,
      })
      mutateGoalChange(recent, data => {
        data.createdAt = 300
        data.updatedAt = 300
      })
      for (const fixture of [tiedA, tiedB]) {
        mutateGoalChange(fixture, data => {
          data.createdAt = 200
          data.updatedAt = 200
        })
      }
      const before = snapshotTree(recent.dataDir)
      const first = await listGoals({ dataDir: recent.dataDir })
      const second = await listGoals({ dataDir: recent.dataDir })
      const tied = [tiedA, tiedB].toSorted((left, right) =>
        left.goalId < right.goalId ? -1 : 1
      )
      const expected = [recent, ...tied].map((fixture, index) => ({
        id: fixture.goalId,
        objective: index === 0
          ? 'Recent\nGoal'
          : fixture === tiedA ? 'Tied A' : 'Tied B',
        phase: 'active' as const,
        maxGoalRounds: 3,
        roundsStarted: 0,
        updatedAt: index === 0 ? 300 : 200,
        session: {
          id: fixture.sessionId,
          eventCount: sessionEventCount(fixture.dataDir, fixture.sessionId),
        },
      }))

      expect(first).toEqual({
        schemaVersion: 'tianwen.goal-list.v1',
        goals: expected,
        runtime: {
          activation: 'not-loaded',
          modelRequests: 0,
          readOnly: true,
        },
      })
      expect(second).toEqual(first)
      expect(JSON.stringify(first)).not.toContain('PRIVATE_USER_MESSAGE')
      expect(JSON.stringify(first)).not.toContain('PRIVATE_TOOL_ARGUMENT')
      expect(JSON.stringify(first)).not.toContain('PRIVATE_TOOL_RESULT')
      expect(JSON.stringify(first)).not.toContain(recent.dataDir)
      expect(snapshotTree(recent.dataDir)).toEqual(before)
    } finally {
      rmSync(recent.dataDir, { recursive: true, force: true })
    }
  })

  it('returns an empty list without creating a missing Session root', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'empty-list-'))
    try {
      const before = snapshotTree(dataDir)
      const expected = {
        schemaVersion: 'tianwen.goal-list.v1' as const,
        goals: [],
        runtime: {
          activation: 'not-loaded' as const,
          modelRequests: 0 as const,
          readOnly: true as const,
        },
      }
      expect(await listGoals({ dataDir })).toEqual(expected)
      expect(await listGoals({ dataDir })).toEqual(expected)
      expect(existsSync(join(dataDir, 'dsh-home', 'sessions'))).toBe(false)
      expect(snapshotTree(dataDir)).toEqual(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('ignores a durable Session without a current Goal', async () => {
    const fixture = await createFixture({ withEvidence: false })
    try {
      const goalLessSessionId = await addGoalLessSession(fixture.dataDir)
      const before = snapshotTree(fixture.dataDir)
      const projection = await listGoals({ dataDir: fixture.dataDir })

      expect(projection.goals.map(goal => goal.id)).toEqual([fixture.goalId])
      expect(JSON.stringify(projection)).not.toContain(goalLessSessionId)
      expect(JSON.stringify(projection)).not.toContain('GOAL_LESS_PRIVATE_MESSAGE')
      expect(snapshotTree(fixture.dataDir)).toEqual(before)
    } finally {
      rmSync(fixture.dataDir, { recursive: true, force: true })
    }
  })

  it('fails closed when a current Goal replay is incomplete', async () => {
    const fixture = await createFixture({ withEvidence: false })
    try {
      mutateGoalChange(fixture, data => {
        delete data.updatedAt
      })
      const before = snapshotTree(fixture.dataDir)
      await expect(listGoals({ dataDir: fixture.dataDir }))
        .rejects.toBeInstanceOf(GoalStatusIntegrityError)
      expect(snapshotTree(fixture.dataDir)).toEqual(before)
    } finally {
      rmSync(fixture.dataDir, { recursive: true, force: true })
    }
  })

  it('keeps Goal A status when an unrelated Goal B id is duplicated', async () => {
    const goalA = await createFixture({
      objective: 'Goal A remains readable',
      withEvidence: false,
    })
    try {
      const goalB = await createFixture({
        root: goalA.dataDir,
        objective: 'Goal B',
        withEvidence: false,
      })
      const duplicateB = await createFixture({
        root: goalA.dataDir,
        objective: 'Duplicate Goal B',
        withEvidence: false,
      })
      const duplicateLog = sessionLog(goalA.dataDir, duplicateB.sessionId)
      const original = readFileSync(duplicateLog, 'utf8')
      writeFileSync(
        duplicateLog,
        original.replaceAll(duplicateB.goalId, goalB.goalId),
      )

      const status = await readGoalStatus({
        goalId: goalA.goalId,
        dataDir: goalA.dataDir,
      })
      expect(status.schemaVersion).toBe('tianwen.goal-status.v1')
      expect(status.goal).toEqual(expect.objectContaining({
        id: goalA.goalId,
        objective: 'Goal A remains readable',
      }))
    } finally {
      rmSync(goalA.dataDir, { recursive: true, force: true })
    }
  })

  it('fails Goal A status when an unrelated Goal B replay is structurally invalid', async () => {
    const goalA = await createFixture({
      objective: 'Goal A remains readable',
      withEvidence: false,
    })
    try {
      const goalB = await createFixture({
        root: goalA.dataDir,
        objective: 'Incomplete Goal B',
        withEvidence: false,
      })
      mutateGoalChange(goalB, data => {
        delete data.updatedAt
      })

      await expect(readGoalStatus({
        goalId: goalA.goalId,
        dataDir: goalA.dataDir,
      })).rejects.toBeInstanceOf(GoalStatusIntegrityError)
    } finally {
      rmSync(goalA.dataDir, { recursive: true, force: true })
    }
  })

  it('prints deterministic Goal list text and exact JSON through the CLI', async () => {
    const first = await createFixture({
      objective: 'First \n\t  Goal',
      withEvidence: false,
    })
    try {
      const second = await createFixture({
        root: first.dataDir,
        objective: 'Second\tGoal',
        withEvidence: false,
      })
      mutateGoalChange(first, data => {
        data.createdAt = 200
        data.updatedAt = 200
      })
      mutateGoalChange(second, data => {
        data.createdAt = 100
        data.updatedAt = 100
      })
      const expected = {
        schemaVersion: 'tianwen.goal-list.v1',
        goals: [
          {
            id: first.goalId,
            objective: 'First \n\t  Goal',
            phase: 'active',
            maxGoalRounds: 3,
            roundsStarted: 0,
            updatedAt: 200,
            session: {
              id: first.sessionId,
              eventCount: sessionEventCount(first.dataDir, first.sessionId),
            },
          },
          {
            id: second.goalId,
            objective: 'Second\tGoal',
            phase: 'active',
            maxGoalRounds: 3,
            roundsStarted: 0,
            updatedAt: 100,
            session: {
              id: second.sessionId,
              eventCount: sessionEventCount(second.dataDir, second.sessionId),
            },
          },
        ],
        runtime: {
          activation: 'not-loaded',
          modelRequests: 0,
          readOnly: true,
        },
      }
      const json = execFileSync(process.execPath, [
        CLI, 'list', '--data-dir', first.dataDir, '--json',
      ], { encoding: 'utf8' })
      expect(json).toBe(`${JSON.stringify(expected)}\n`)
      expect(execFileSync(process.execPath, [
        CLI, 'list', '--data-dir', first.dataDir, '--json',
      ], { encoding: 'utf8' })).toBe(json)

      expect(execFileSync(process.execPath, [
        CLI, 'list', '--data-dir', first.dataDir,
      ], { encoding: 'utf8' })).toBe([
        'Goals: 2',
        `[active] ${first.goalId} 0/3 rounds - First Goal (session ${first.sessionId})`,
        `[active] ${second.goalId} 0/3 rounds - Second Goal (session ${second.sessionId})`,
        'Runtime: not-loaded; read-only; 0 model requests',
        '',
      ].join('\n'))
    } finally {
      rmSync(first.dataDir, { recursive: true, force: true })
    }
  })

  it('prints one fixed line for an empty Goal list', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'empty-cli-list-'))
    try {
      expect(execFileSync(process.execPath, [
        CLI, 'list', '--data-dir', dataDir,
      ], { encoding: 'utf8' })).toBe('No Goals.\n')
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('rejects invalid list grammar with managed and portable usage', () => {
    const usage = [
      'Usage: tianwen status --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
      'Usage: tianwen status --goal GOAL_ID --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--json]',
      'Usage: tianwen list --data-dir ABSOLUTE_PATH [--json]',
      'Usage: tianwen list --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--json]',
      '',
    ].join('\n')
    for (const args of [
      ['list', '--goal', 'forbidden', '--data-dir', FIXTURE_BASE],
      ['list'],
      ['list', '--data-dir', 'relative'],
      ['list', '--data-dir', FIXTURE_BASE, 'extra'],
    ]) {
      const result = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      expect(result.status).toBe(2)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe(usage)
    }
  })

  it('fails list ambiguity and integrity errors without stdout', async () => {
    const duplicate = await createFixture({ withEvidence: false })
    try {
      const second = await createFixture({
        root: duplicate.dataDir,
        withEvidence: false,
      })
      const path = sessionLog(duplicate.dataDir, second.sessionId)
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replaceAll(second.goalId, duplicate.goalId),
      )
      const result = spawnSync(process.execPath, [
        CLI, 'list', '--data-dir', duplicate.dataDir,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('Goal is present in more than one Session')
      expect(result.stderr).not.toContain(duplicate.dataDir)
    } finally {
      rmSync(duplicate.dataDir, { recursive: true, force: true })
    }

    const corrupt = await createFixture({ withEvidence: false })
    try {
      mutateGoalChange(corrupt, data => {
        delete data.updatedAt
      })
      const result = spawnSync(process.execPath, [
        CLI, 'list', '--data-dir', corrupt.dataDir,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('Error:')
      expect(result.stderr).not.toContain(corrupt.dataDir)
    } finally {
      rmSync(corrupt.dataDir, { recursive: true, force: true })
    }
  })

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

  it('projects no Champion across four private natural Run facts', async () => {
    const fixture = await createFixture({ withEvidence: false })
    try {
      seedPrivateNaturalRun(fixture.evolutionRoot)
      const before = snapshotTree(fixture.dataDir)

      const status = await readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })
      expect(status.champion).toBeNull()
      const cli = execFileSync(process.execPath, [
        CLI,
        'status',
        '--goal', fixture.goalId,
        '--data-dir', fixture.dataDir,
        '--json',
      ], { encoding: 'utf8' })
      expect(JSON.parse(cli)).toEqual(status)
      for (const privateValue of [
        'run-binding-recorded',
        'run-skill-manifest-recorded',
        'outcome-intake-recorded',
        'run-skill-use-recorded',
        'tianwen-stage4-scripted',
        GOVERNED_PARENT.content,
        'session:goal-status-private-run',
        'project:tianwen/capability:goal-status',
        fixture.dataDir,
      ]) {
        expect(cli).not.toContain(privateValue)
      }
      expect(snapshotTree(fixture.dataDir)).toEqual(before)
    } finally {
      rmSync(fixture.dataDir, { recursive: true, force: true })
    }
  })

  it('projects the legacy Champion with interleaved private Run facts', async () => {
    const fixture = await createFixture({ withEvidence: false })
    try {
      let champion: ReturnType<typeof addChampionToLedger> | undefined
      seedPrivateNaturalRun(fixture.evolutionRoot, ledger => {
        champion = addChampionToLedger(ledger)
      })
      const before = snapshotTree(fixture.dataDir)

      expect((await readGoalStatus({
        goalId: fixture.goalId,
        dataDir: fixture.dataDir,
      })).champion).toEqual(champion)
      expect(snapshotTree(fixture.dataDir)).toEqual(before)
    } finally {
      rmSync(fixture.dataDir, { recursive: true, force: true })
    }
  })

  it('maps invalid private or Champion history to one safe status error', async () => {
    for (const kind of [
      'broken-private',
      'unknown-event',
      'pointer-mismatch',
    ] as const) {
      const fixture = await createFixture({ withEvidence: false })
      try {
        seedPrivateNaturalRun(fixture.evolutionRoot)
        const ledgerPath = join(fixture.evolutionRoot, 'ledger.jsonl')
        if (kind === 'broken-private') {
          const lines = readFileSync(ledgerPath, 'utf8').trimEnd().split('\n')
          writeFileSync(ledgerPath, `${lines.slice(1).join('\n')}\n`)
        } else if (kind === 'unknown-event') {
          writeFileSync(ledgerPath, `${JSON.stringify({
            type: 'unknown-governed-event',
            at: '2026-08-22T00:00:00.000Z',
          })}\n`, { flag: 'a' })
        } else {
          addChampion(fixture.evolutionRoot)
          writeFileSync(
            join(fixture.evolutionRoot, 'champion.json'),
            `${JSON.stringify({
              artifactId: `artifact:${'f'.repeat(64)}`,
              revision: 1,
            })}\n`,
          )
        }
        const before = snapshotTree(fixture.dataDir)
        await expect(readGoalStatus({
          goalId: fixture.goalId,
          dataDir: fixture.dataDir,
        })).rejects.toMatchObject({
          name: 'GoalStatusIntegrityError',
          message: 'Evolution ledger is invalid',
        })
        expect(snapshotTree(fixture.dataDir)).toEqual(before)
      } finally {
        rmSync(fixture.dataDir, { recursive: true, force: true })
      }
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

      await expect(listGoals({ dataDir: first.dataDir }))
        .rejects.toBeInstanceOf(GoalStatusAmbiguousError)
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
