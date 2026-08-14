import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import TimerService from '@deepseek-ai/cordis-plugin-timer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const syncAudit = vi.hoisted(() => ({
  enabled: false,
  paths: [] as string[],
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const paths = new Map<number, string>()
  return {
    ...actual,
    openSync(path: string, flags: string, mode?: number) {
      const descriptor = actual.openSync(path, flags, mode)
      if (syncAudit.enabled) {
        paths.set(descriptor, String(path))
      }
      return descriptor
    },
    fsyncSync(descriptor: number) {
      if (syncAudit.enabled) {
        const path = paths.get(descriptor)
        if (path !== undefined) {
          syncAudit.paths.push(path)
        }
      }
      actual.fsyncSync(descriptor)
    },
  }
})

import {
  Context,
  DynamicCordisRunnerService,
  Inbox,
  Session,
  SessionId,
  SystemPrompt,
  ToolRuntime,
} from '@tianwen/dsh-compat'
import type { Agent } from '@tianwen/dsh-compat'
import {
  EvolutionActivationError,
  EvolutionGovernanceError,
  EvolutionLedger,
  EvolutionRecoveryError,
  LedgerIntegrityError,
  TianwenEvolutionService,
} from '../../packages/tianwen-evolution/src/index.js'
import type {
  ApprovalRecord,
  ArtifactId,
  ArtifactVersion,
  EvaluationRecord,
  LedgerEvent,
} from '../../packages/tianwen-evolution/src/index.js'

const V1 = 'return { name: "v1", apply() {} }'
const V2 = 'return { name: "v2", apply() {} }'
const BROKEN = 'throw new Error("broken update")'
const UNAPPROVED = 'return { name: "unapproved", apply() {} }'

const V1_DIGEST =
  '4b8cbe5648a7059510cca1b76cd6accc5310d62f86d74abf588230483cbe6342'
const RECEIPT_A = `sha256:${'a'.repeat(64)}` as const
const RECEIPT_B = `sha256:${'b'.repeat(64)}` as const
const RECEIPT_C = `sha256:${'c'.repeat(64)}` as const

const fixtureRoots: string[] = []

function probeRoot(): string {
  const configured = process.env.TIANWEN_DSH_PROBE_ROOT
  if (configured === undefined) {
    throw new Error('TIANWEN_DSH_PROBE_ROOT is required')
  }
  const root = resolve(configured, 'task-7-ledgers')
  mkdirSync(root, { recursive: true })
  return root
}

function ledgerRoot(prefix: string): string {
  const root = mkdtempSync(join(probeRoot(), `${prefix}-`))
  fixtureRoots.push(root)
  return root
}

function deterministicClock(): () => string {
  let tick = 0
  return () => new Date(Date.UTC(2026, 7, 14, 0, 0, tick++))
    .toISOString()
}

function evaluation(
  artifactId: ArtifactId,
  verdict: EvaluationRecord['verdict'],
  receiptDigest: EvaluationRecord['receiptDigest'] = RECEIPT_A,
): EvaluationRecord {
  return { artifactId, receiptDigest, verdict }
}

function approval(
  artifactId: ArtifactId,
  approvalId: string,
): ApprovalRecord {
  return { artifactId, authority: 'human', approvalId }
}

interface FormalRecordStore {
  recordArtifact(
    source: string,
    parentArtifactId?: ArtifactId,
  ): ArtifactVersion
  recordEvaluation(record: EvaluationRecord): void
  recordApproval(record: ApprovalRecord): void
}

function prepareMetArtifact(
  ledger: FormalRecordStore,
  source: string,
  approvalId: string,
  receiptDigest: EvaluationRecord['receiptDigest'],
  parentArtifactId?: ArtifactId,
): ArtifactVersion {
  const artifact = ledger.recordArtifact(source, parentArtifactId)
  ledger.recordEvaluation(
    evaluation(artifact.artifactId, 'met', receiptDigest),
  )
  ledger.recordApproval(approval(artifact.artifactId, approvalId))
  return artifact
}

function createStubAgent(ctx: Context, id: string): Agent {
  const session = Session.create(SessionId(id))
  const inbox = new Inbox(session, {
    inserted() {},
    discarded() {},
    claimed() {},
  })
  return {
    id: session.id,
    options: {},
    session,
    inbox,
    status: 'running',
    ctx,
    cancel() {},
    whenIdle: () => Promise.resolve(),
    runMaintenance: task => task(new AbortController().signal),
    send(message, target) {
      inbox.append(target, message)
    },
    followup(message) {
      inbox.append('next-turn', message)
    },
    steer(message) {
      inbox.append('next-step', message)
    },
    inject(message) {
      inbox.append('next-step', message)
    },
  }
}

async function mountEvolution(
  root: string,
  agentId = `evolution-${randomUUID()}`,
): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  await ctx.plugin(TimerService)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(DynamicCordisRunnerService, {})
  await ctx.plugin(TianwenEvolutionService, {
    root,
    clock: deterministicClock(),
  })
  return { ctx, agent: createStubAgent(ctx, agentId) }
}

function eventTypes(events: readonly LedgerEvent[]): string[] {
  return events.map(event => event.type)
}

afterEach(() => {
  vi.restoreAllMocks()
  syncAudit.enabled = false
  syncAudit.paths = []
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen append-only evolution ledger', () => {
  it('fsyncs immutable source before accepting its ledger event', () => {
    const root = ledgerRoot('source-fsync')
    const ledger = new EvolutionLedger(root, {
      clock: deterministicClock(),
    })
    syncAudit.enabled = true

    ledger.recordArtifact(V1)

    expect(syncAudit.paths).toEqual([
      join(root, 'artifacts', `sha256-${V1_DIGEST}.mjs`),
      join(root, 'ledger.jsonl'),
    ])
  })

  it('uses source bytes as identity and rejects replacement at that digest', () => {
    const root = ledgerRoot('identity')
    const ledger = new EvolutionLedger(root, {
      clock: deterministicClock(),
    })

    const first = ledger.recordArtifact(V1)
    const replay = ledger.recordArtifact(V1)
    const different = ledger.recordArtifact(V2, first.artifactId)

    expect(first).toEqual({
      artifactId: `artifact:${V1_DIGEST}`,
      sourceDigest: `sha256:${V1_DIGEST}`,
      createdAt: '2026-08-14T00:00:00.000Z',
    })
    expect(replay).toEqual(first)
    expect(different.artifactId).not.toBe(first.artifactId)
    expect(
      ledger.listEvents().filter(event => event.type === 'artifact-recorded'),
    ).toHaveLength(2)

    const sourcePath = join(
      root,
      'artifacts',
      `sha256-${V1_DIGEST}.mjs`,
    )
    writeFileSync(sourcePath, 'replacement bytes', 'utf8')
    expect(() => ledger.recordArtifact(V1)).toThrow(LedgerIntegrityError)
  })

  it('rejects missing, failed, inconclusive, and unapproved evaluations', () => {
    const ledger = new EvolutionLedger(ledgerRoot('gates'), {
      clock: deterministicClock(),
    })
    const candidate = ledger.recordArtifact(V1)

    expect(() => ledger.promote(candidate.artifactId)).toThrowError(
      expect.objectContaining<EvolutionGovernanceError>({
        code: 'evaluation-required',
      }),
    )

    ledger.recordEvaluation(evaluation(candidate.artifactId, 'not_met'))
    expect(() => ledger.promote(candidate.artifactId)).toThrowError(
      expect.objectContaining<EvolutionGovernanceError>({
        code: 'evaluation-not-met',
      }),
    )

    ledger.recordEvaluation(evaluation(candidate.artifactId, 'inconclusive'))
    expect(() => ledger.promote(candidate.artifactId)).toThrowError(
      expect.objectContaining<EvolutionGovernanceError>({
        code: 'evaluation-not-met',
      }),
    )

    ledger.recordEvaluation(evaluation(candidate.artifactId, 'met'))
    expect(() => ledger.promote(candidate.artifactId)).toThrowError(
      expect.objectContaining<EvolutionGovernanceError>({
        code: 'human-approval-required',
      }),
    )
    expect(ledger.getChampion()).toBeUndefined()
  })

  it('replays monotonic promotions and approved rollback without deleting history', () => {
    const root = ledgerRoot('replay')
    const ledger = new EvolutionLedger(root, {
      clock: deterministicClock(),
    })
    const v1 = prepareMetArtifact(
      ledger,
      V1,
      'human-v1-promote',
      RECEIPT_A,
    )
    expect(ledger.promote(v1.artifactId)).toEqual({
      artifactId: v1.artifactId,
      revision: 1,
    })
    const v2 = prepareMetArtifact(
      ledger,
      V2,
      'human-v2-promote',
      RECEIPT_B,
      v1.artifactId,
    )
    expect(ledger.promote(v2.artifactId)).toEqual({
      artifactId: v2.artifactId,
      revision: 2,
    })

    expect(() => ledger.rollback(v1.artifactId)).toThrowError(
      expect.objectContaining<EvolutionGovernanceError>({
        code: 'human-approval-required',
      }),
    )
    ledger.recordApproval(approval(v1.artifactId, 'human-v1-rollback'))
    expect(ledger.rollback(v1.artifactId)).toEqual({
      artifactId: v1.artifactId,
      revision: 3,
    })

    const beforeReload = ledger.listEvents()
    expect(eventTypes(beforeReload)).toEqual([
      'artifact-recorded',
      'evaluation-recorded',
      'approval-recorded',
      'promoted',
      'artifact-recorded',
      'evaluation-recorded',
      'approval-recorded',
      'promoted',
      'approval-recorded',
      'rolled-back',
    ])
    expect(
      beforeReload.filter(event => event.type === 'artifact-recorded'),
    ).toHaveLength(2)

    const serialized = readFileSync(join(root, 'ledger.jsonl'), 'utf8')
    expect(serialized.endsWith('\n')).toBe(true)
    for (const line of serialized.trimEnd().split('\n')) {
      expect(JSON.stringify(JSON.parse(line))).toBe(line)
    }

    const reloaded = new EvolutionLedger(root)
    expect(reloaded.getChampion()).toEqual({
      artifactId: v1.artifactId,
      revision: 3,
    })
    expect(reloaded.listEvents()).toEqual(beforeReload)
    expect(
      JSON.parse(readFileSync(join(root, 'champion.json'), 'utf8')),
    ).toEqual({
      artifactId: v1.artifactId,
      revision: 3,
    })
  })

  it('rejects a champion pointer that disagrees with ledger replay', () => {
    const root = ledgerRoot('pointer')
    const ledger = new EvolutionLedger(root, {
      clock: deterministicClock(),
    })
    const v1 = prepareMetArtifact(
      ledger,
      V1,
      'human-v1',
      RECEIPT_A,
    )
    ledger.promote(v1.artifactId)
    writeFileSync(
      join(root, 'champion.json'),
      `${JSON.stringify({
        artifactId: v1.artifactId,
        revision: 99,
      })}\n`,
      'utf8',
    )

    expect(() => new EvolutionLedger(root)).toThrow(LedgerIntegrityError)
  })

  it('repairs a pointer exactly one committed transition behind ledger replay', () => {
    const root = ledgerRoot('stale-pointer')
    const ledger = new EvolutionLedger(root, {
      clock: deterministicClock(),
    })
    const v1 = prepareMetArtifact(
      ledger,
      V1,
      'human-v1',
      RECEIPT_A,
    )
    const v1Pointer = ledger.promote(v1.artifactId)
    const v2 = prepareMetArtifact(
      ledger,
      V2,
      'human-v2',
      RECEIPT_B,
      v1.artifactId,
    )
    const v2Pointer = ledger.promote(v2.artifactId)
    writeFileSync(
      join(root, 'champion.json'),
      `${JSON.stringify(v1Pointer)}\n`,
      'utf8',
    )

    const reloaded = new EvolutionLedger(root)

    expect(reloaded.getChampion()).toEqual(v2Pointer)
    expect(
      JSON.parse(readFileSync(join(root, 'champion.json'), 'utf8')),
    ).toEqual(v2Pointer)
  })
})

describe('formal governance over process-local Dynamic Cordis versions', () => {
  it('serializes concurrent transitions before a second define/run can reuse approval', async () => {
    const root = ledgerRoot('concurrent')
    const mounted = await mountEvolution(root)
    const evolution = mounted.ctx.tianwenEvolution

    try {
      const v1 = prepareMetArtifact(
        evolution,
        V1,
        'human-v1-once',
        RECEIPT_A,
      )
      const results = await Promise.allSettled([
        evolution.promote(mounted.agent, v1.artifactId),
        evolution.promote(mounted.agent, v1.artifactId),
      ])

      expect(results.filter(result => result.status === 'fulfilled'))
        .toHaveLength(1)
      expect(results.filter(result => result.status === 'rejected'))
        .toHaveLength(1)
      expect(
        results.find(result => result.status === 'rejected'),
      ).toMatchObject({
        reason: expect.any(EvolutionGovernanceError),
      })
      expect(mounted.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        packages: [{}],
        activeRun: {},
      }])
      expect(
        evolution.listEvents().filter(event => event.type === 'promoted'),
      ).toHaveLength(1)
      expect(evolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('runs V1, V2, approved rollback, BROKEN recovery, refusal, and restart rehydration', async () => {
    const root = ledgerRoot('dynamic')
    const agentId = `evolution-sequence-${randomUUID()}`
    const first = await mountEvolution(root, agentId)
    const evolution = first.ctx.tianwenEvolution
    let second: Awaited<ReturnType<typeof mountEvolution>> | undefined

    try {
      const v1 = prepareMetArtifact(
        evolution,
        V1,
        'human-v1-promote',
        RECEIPT_A,
      )
      expect('ledger' in evolution).toBe(false)
      const v1Binding = await evolution.promote(first.agent, v1.artifactId)
      expect(evolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
      expect(first.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        pluginId: v1Binding.pluginId,
        currentPackageId: v1Binding.packageId,
        activeRun: { packageId: v1Binding.packageId },
        packages: [{ packageId: v1Binding.packageId }],
      }])

      const v2 = prepareMetArtifact(
        evolution,
        V2,
        'human-v2-promote',
        RECEIPT_B,
        v1.artifactId,
      )
      const v2Binding = await evolution.promote(first.agent, v2.artifactId)
      expect(evolution.getChampion()).toEqual({
        artifactId: v2.artifactId,
        revision: 2,
      })
      expect(first.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        pluginId: v1Binding.pluginId,
        currentPackageId: v2Binding.packageId,
        activeRun: { packageId: v2Binding.packageId },
        packages: [
          { packageId: v1Binding.packageId },
          { packageId: v2Binding.packageId },
        ],
      }])

      const beforeRollback = first.ctx.dynamicCordisRunner.inventory()
      await expect(
        evolution.rollback(first.agent, v1.artifactId),
      ).rejects.toMatchObject({
        code: 'human-approval-required',
      })
      expect(first.ctx.dynamicCordisRunner.inventory()).toEqual(beforeRollback)

      evolution.recordApproval(
        approval(v1.artifactId, 'human-v1-rollback'),
      )
      const rollbackBinding = await evolution.rollback(
        first.agent,
        v1.artifactId,
      )
      expect(rollbackBinding).toMatchObject({
        artifactId: v1.artifactId,
        pluginId: v1Binding.pluginId,
      })
      expect(rollbackBinding.packageId).not.toBe(v1Binding.packageId)
      expect(evolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 3,
      })
      expect(first.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        currentPackageId: rollbackBinding.packageId,
        activeRun: { packageId: rollbackBinding.packageId },
        packages: [
          { packageId: v1Binding.packageId },
          { packageId: v2Binding.packageId },
          { packageId: rollbackBinding.packageId },
        ],
      }])

      const broken = prepareMetArtifact(
        evolution,
        BROKEN,
        'human-broken-promote',
        RECEIPT_C,
        v1.artifactId,
      )
      await expect(
        evolution.promote(first.agent, broken.artifactId),
      ).rejects.toBeInstanceOf(EvolutionActivationError)
      expect(evolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 3,
      })
      expect(first.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        currentPackageId: rollbackBinding.packageId,
        activeRun: { packageId: rollbackBinding.packageId },
        packages: [
          { packageId: v1Binding.packageId },
          { packageId: v2Binding.packageId },
          { packageId: rollbackBinding.packageId },
          {},
        ],
      }])
      expect(eventTypes(evolution.listEvents()))
        .toContain('activation-failed')

      const unapproved = evolution.recordArtifact(
        UNAPPROVED,
        v1.artifactId,
      )
      evolution.recordEvaluation(
        evaluation(unapproved.artifactId, 'met', RECEIPT_A),
      )
      const beforeRefusal = first.ctx.dynamicCordisRunner.inventory()
      await expect(
        evolution.promote(first.agent, unapproved.artifactId),
      ).rejects.toBeInstanceOf(EvolutionGovernanceError)
      expect(first.ctx.dynamicCordisRunner.inventory()).toEqual(beforeRefusal)

      const championBeforeRestart = evolution.getChampion()
      const runtimeEventsBefore = evolution.listEvents()
        .filter(event => event.type === 'runtime-bound').length
      await first.ctx.fiber.dispose()

      second = await mountEvolution(root, agentId)
      expect(second.ctx.dynamicCordisRunner.inventory()).toEqual([])
      expect(second.ctx.tianwenEvolution.getChampion())
        .toEqual(championBeforeRestart)

      const rebound = await second.ctx.tianwenEvolution
        .rehydrateChampion(second.agent)
      expect(rebound?.artifactId).toBe(v1.artifactId)
      expect(second.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        pluginId: rebound?.pluginId,
        currentPackageId: rebound?.packageId,
        activeRun: { packageId: rebound?.packageId },
      }])
      expect(second.ctx.tianwenEvolution.getChampion())
        .toEqual(championBeforeRestart)
      const runtimeEventsAfter = second.ctx.tianwenEvolution
        .listEvents()
        .filter(event => event.type === 'runtime-bound')
      expect(runtimeEventsAfter).toHaveLength(runtimeEventsBefore + 1)
      expect(runtimeEventsAfter.at(-1)).toMatchObject({
        type: 'runtime-bound',
        artifactId: v1.artifactId,
        pluginId: rebound?.pluginId,
        packageId: rebound?.packageId,
      })
    } finally {
      if (second !== undefined) {
        await second.ctx.fiber.dispose()
      } else {
        await first.ctx.fiber.dispose()
      }
    }
  })

  it('returns EvolutionRecoveryError and blocks when the old Champion cannot reactivate', async () => {
    const root = ledgerRoot('recovery-error')
    const mounted = await mountEvolution(root)
    const evolution = mounted.ctx.tianwenEvolution

    try {
      const v1 = prepareMetArtifact(
        evolution,
        V1,
        'human-v1',
        RECEIPT_A,
      )
      const v1Binding = await evolution.promote(
        mounted.agent,
        v1.artifactId,
      )
      const broken = prepareMetArtifact(
        evolution,
        BROKEN,
        'human-broken',
        RECEIPT_B,
        v1.artifactId,
      )
      const realRun = mounted.ctx.dynamicCordisRunner.run.bind(
        mounted.ctx.dynamicCordisRunner,
      )
      vi.spyOn(mounted.ctx.dynamicCordisRunner, 'run')
        .mockImplementation(async (agent, pluginId, packageId, mode, signal) => {
          if (packageId === v1Binding.packageId && mode === 'run') {
            return {
              ok: false,
              reason: 'host-half-failed',
              message: 'forced previous Champion recovery failure',
            }
          }
          return realRun(agent, pluginId, packageId, mode, signal)
        })

      await expect(
        evolution.promote(mounted.agent, broken.artifactId),
      ).rejects.toBeInstanceOf(EvolutionRecoveryError)
      expect(evolution.blocked).toBe(true)
      expect(evolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
      expect(eventTypes(evolution.listEvents())).toEqual(
        expect.arrayContaining([
          'activation-failed',
          'recovery-failed',
        ]),
      )
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('restores the active Champion and blocks when activation failure audit cannot append', async () => {
    const root = ledgerRoot('audit-write-error')
    const mounted = await mountEvolution(root)
    const evolution = mounted.ctx.tianwenEvolution

    try {
      const v1 = prepareMetArtifact(
        evolution,
        V1,
        'human-v1',
        RECEIPT_A,
      )
      const v1Binding = await evolution.promote(
        mounted.agent,
        v1.artifactId,
      )
      const broken = prepareMetArtifact(
        evolution,
        BROKEN,
        'human-broken',
        RECEIPT_B,
        v1.artifactId,
      )
      const ledgerPath = join(root, 'ledger.jsonl')
      rmSync(ledgerPath)
      mkdirSync(ledgerPath)

      await expect(
        evolution.promote(mounted.agent, broken.artifactId),
      ).rejects.toBeInstanceOf(EvolutionRecoveryError)
      expect(evolution.blocked).toBe(true)
      expect(evolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
      expect(mounted.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        currentPackageId: v1Binding.packageId,
        activeRun: { packageId: v1Binding.packageId },
      }])
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })
})
