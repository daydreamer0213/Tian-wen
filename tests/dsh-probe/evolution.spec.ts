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
  failChampionRenames: 0,
  failLedgerFsyncAfterReal: 0,
  shortLedgerWrites: 0,
  shortPointerWrites: 0,
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
      const path = paths.get(descriptor)
      if (
        syncAudit.failLedgerFsyncAfterReal > 0 &&
        path?.endsWith('ledger.jsonl') === true
      ) {
        syncAudit.failLedgerFsyncAfterReal -= 1
        throw Object.assign(new Error('forced ledger fsync uncertainty'), {
          code: 'EIO',
        })
      }
    },
    writeSync(
      descriptor: number,
      buffer: string | Uint8Array,
      offset?: number,
      length?: number | BufferEncoding,
      position?: number,
    ) {
      const path = paths.get(descriptor)
      const shouldShortWrite =
        (
          syncAudit.shortLedgerWrites > 0 &&
          path?.endsWith('ledger.jsonl') === true
        ) ||
        (
          syncAudit.shortPointerWrites > 0 &&
          path?.includes('.champion-') === true
        )
      if (!shouldShortWrite) {
        if (typeof buffer === 'string') {
          return actual.writeSync(
            descriptor,
            buffer,
            offset,
            length as BufferEncoding | undefined,
          )
        }
        return actual.writeSync(
          descriptor,
          buffer,
          offset ?? 0,
          length as number,
          position,
        )
      }
      if (path?.endsWith('ledger.jsonl') === true) {
        syncAudit.shortLedgerWrites -= 1
      } else {
        syncAudit.shortPointerWrites -= 1
      }
      if (typeof buffer === 'string') {
        return actual.writeSync(
          descriptor,
          buffer.slice(0, Math.max(1, Math.floor(buffer.length / 2))),
          offset,
          length as BufferEncoding | undefined,
        )
      }
      return actual.writeSync(
        descriptor,
        buffer,
        offset ?? 0,
        Math.max(1, Math.floor((length as number) / 2)),
        position,
      )
    },
    renameSync(oldPath: string, newPath: string) {
      if (
        syncAudit.failChampionRenames > 0 &&
        String(newPath).endsWith('champion.json')
      ) {
        syncAudit.failChampionRenames -= 1
        throw Object.assign(new Error('forced champion rename failure'), {
          code: 'EACCES',
        })
      }
      actual.renameSync(oldPath, newPath)
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
import {
  EvolutionLedger,
} from '../../packages/tianwen-evolution/src/ledger.js'

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

async function mountEvolutionWithoutRunner(
  root: string,
  agentId = `evolution-${randomUUID()}`,
): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  await ctx.plugin(TimerService)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, {})
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
  syncAudit.failChampionRenames = 0
  syncAudit.failLedgerFsyncAfterReal = 0
  syncAudit.shortLedgerWrites = 0
  syncAudit.shortPointerWrites = 0
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen append-only evolution ledger', () => {
  it('keeps executable ledger transitions off the public package surface', async () => {
    const publicApi = await import(
      '../../packages/tianwen-evolution/src/index.js'
    )

    expect(publicApi).not.toHaveProperty('EvolutionLedger')
  })

  it('reads the one Run binding for an exact DSH Session after reload', async () => {
    const root = ledgerRoot('run-binding-by-session')
    const first = await mountEvolution(root)
    const bindingInput = {
      goalRef: 'goal:session-index',
      taskRef: 'task:session-index',
      sessionId: 'session:session-index',
      scopeKey: 'project:tianwen/capability:session-index',
      acceptanceContract: {
        source: 'dsh-tool-result' as const,
        toolName: 'verify_session_index',
        notMetErrorCode: 'SESSION_INDEX_NOT_MET',
        gapDisposition: 'observe' as const,
      },
    }
    const publicEventsBefore = first.ctx.tianwenEvolution.listEvents()
    const receipt = first.ctx.tianwenEvolution.recordRunBinding(bindingInput)
    const byRun = first.ctx.tianwenEvolution.getRunBinding(receipt.runId)
    const bySession = first.ctx.tianwenEvolution
      .getRunBindingBySessionId(bindingInput.sessionId)

    expect(bySession).toEqual(byRun)
    expect(bySession).not.toBe(byRun)
    expect(bySession?.acceptanceContract).not.toBe(byRun?.acceptanceContract)
    expect(first.ctx.tianwenEvolution.listEvents()).toEqual(publicEventsBefore)
    expect(first.ctx.tianwenEvolution.getRunBindingBySessionId('session:unknown'))
      .toBeUndefined()
    expect(() => first.ctx.tianwenEvolution.recordRunBinding({
      ...bindingInput,
      taskRef: 'task:changed',
    })).toThrow(/already bound to another Tianwen Run/i)

    await first.ctx.fiber.dispose()
    const second = await mountEvolution(root)
    try {
      expect(second.ctx.tianwenEvolution
        .getRunBindingBySessionId(bindingInput.sessionId))
        .toEqual(byRun)
      expect(second.ctx.tianwenEvolution.listEvents()).toEqual(publicEventsBefore)
    } finally {
      await second.ctx.fiber.dispose()
    }
  })

  it('keeps internal Skill evaluation protocols out of runtime event reads', async () => {
    const root = ledgerRoot('private-skill-evaluation')
    const mounted = await mountEvolution(root)
    const evolution = mounted.ctx.tianwenEvolution
    const acceptanceContract = {
      source: 'dsh-tool-result' as const,
      toolName: 'verify_summary',
      notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
      gapDisposition: 'reusable' as const,
      problemCategory: 'summary-omits-required-result',
      severity: 2 as const,
      blocksGoal: false,
    }
    const bind = (suffix: string) => evolution.recordRunBinding({
      goalRef: 'goal:research-preview',
      taskRef: `task:${suffix}`,
      sessionId: `session:${suffix}`,
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract,
    })
    const first = bind('eval-protocol-first')
    evolution.recordOutcomeIntake({
      runId: first.runId,
      verdict: 'not-met',
      sessionDigest: RECEIPT_A,
      evidenceIds: [RECEIPT_A],
    })
    const second = bind('eval-protocol-second')
    const outcome = evolution.recordOutcomeIntake({
      runId: second.runId,
      verdict: 'not-met',
      sessionDigest: RECEIPT_B,
      evidenceIds: [RECEIPT_B],
    })
    const ticketId = outcome.ticketId!

    try {
      const receipt = evolution.freezeSkillEvalProtocol({
        ticketId,
        protocol: {
          cases: [
            ['problem', RECEIPT_A, RECEIPT_B],
            ['regression', RECEIPT_B, RECEIPT_C],
            ['counterexample', RECEIPT_C, RECEIPT_A],
            ['safety', RECEIPT_A, RECEIPT_C],
          ].map(([category, inputDigest, dataSnapshotDigest]) => ({
            caseId: `eval-case:${category}`,
            category,
            inputDigest,
            dataSnapshotDigest,
            acceptanceContract,
          })),
          armOrder: 'baseline-then-candidate',
          repetition: { attempts: 1, reducer: 'all-attempts-must-pass' },
          hardGates: ['problem', 'regression', 'counterexample', 'safety'],
          softMetrics: ['model-requests'],
          thresholds: { requiredCasePasses: 4 },
          budget: {
            maxModelRequestsPerArm: 3,
            maxTokensPerArm: 2_000,
            maxToolCallsPerArm: 2,
            maxElapsedMsPerArm: 10_000,
            maxCnyMilliPerArm: 0,
            maxTotalModelRequests: 24,
            maxTotalTokens: 16_000,
            maxTotalToolCalls: 16,
            maxTotalElapsedMs: 80_000,
            maxTotalCnyMilli: 0,
          },
          execution: {
            providerId: 'tianwen-stage4-scripted',
            modelId: 'scripted',
            toolSchemaDigest: RECEIPT_A,
            validatorContractDigest: RECEIPT_C,
          },
        },
      })
      expect(evolution.getSkillEvalProtocol(receipt.protocolId))
        .toMatchObject({ provenance: 'pre-candidate' })
      expect(eventTypes(evolution.listEvents()))
        .not.toContain('skill-eval-protocol-frozen')
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

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
  it('keeps ordinary learning available without the dynamic runner', async () => {
    const mounted = await mountEvolutionWithoutRunner(
      ledgerRoot('runner-optional-learning'),
    )
    const evolution = mounted.ctx.tianwenEvolution

    try {
      expect('dynamicCordisRunner' in mounted.ctx).toBe(false)
      expect(evolution.recordLearningIntake({
        sessionId: 'session:runner-optional',
        messageId: 'message:runner-optional',
        feedbackVersion: 'feedback:runner-optional',
        rating: 'positive',
        scopeKey: 'project:tianwen/capability:runtime-composition',
        sessionDigest: RECEIPT_A,
        evidenceIds: [RECEIPT_B],
      })).toMatchObject({ decision: 'no-case', duplicate: false })
      const correction = evolution.recordLearningIntake({
        sessionId: 'session:runner-optional-correction',
        messageId: 'message:runner-optional-correction',
        feedbackVersion: 'feedback:runner-optional-correction',
        rating: 'negative',
        note: 'Keep the final result concrete.',
        scopeKey: 'project:tianwen/capability:runtime-composition',
        sessionDigest: RECEIPT_A,
        evidenceIds: [RECEIPT_B],
      })
      expect(evolution.getLearningIntakeStatus(
        'session:runner-optional-correction',
        'message:runner-optional-correction',
      )).toMatchObject({
        sessionId: 'session:runner-optional-correction',
        messageId: 'message:runner-optional-correction',
        ingestionId: correction.ingestionId,
      })
      expect(evolution.listLearningIntakeStatuses(
        'session:runner-optional-correction',
      )).toHaveLength(1)
      expect(evolution.getLearningTicketFeedback(correction.ticketId!)).toEqual({
        ticketId: correction.ticketId,
        scopeKey: 'project:tianwen/capability:runtime-composition',
        latest: {
          note: 'Keep the final result concrete.',
          recordedAt: '2026-08-14T00:00:01.000Z',
          sessionId: 'session:runner-optional-correction',
          messageId: 'message:runner-optional-correction',
        },
      })
      expect(JSON.stringify(evolution.listEvents()))
        .not.toContain('Keep the final result concrete.')
      await expect(evolution.rehydrateChampion(mounted.agent))
        .resolves.toBeUndefined()
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('requires the dynamic runner only when artifact activation begins', async () => {
    const mounted = await mountEvolutionWithoutRunner(
      ledgerRoot('runner-required-activation'),
    )
    const evolution = mounted.ctx.tianwenEvolution

    try {
      const v1 = prepareMetArtifact(
        evolution,
        V1,
        'human-runner-required',
        RECEIPT_A,
      )

      await expect(evolution.promote(mounted.agent, v1.artifactId))
        .rejects.toMatchObject({
          name: 'EvolutionActivationError',
          message: expect.stringMatching(
            /dynamicCordisRunner.*artifact activation/iu,
          ),
        })
      expect(evolution.getChampion()).toBeUndefined()
      expect(evolution.listEvents().filter(
        event => event.type === 'runtime-bound',
      )).toEqual([])
      const failure = evolution.listEvents().find(
        event => event.type === 'activation-failed',
      )
      expect(failure).toBeDefined()
      expect(failure).not.toHaveProperty('binding')
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

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

  it('blocks with EvolutionRecoveryError when failed rehydrate audit cannot append', async () => {
    const root = ledgerRoot('rehydrate-failure-audit')
    const agentId = `rehydrate-failure-${randomUUID()}`
    const first = await mountEvolution(root, agentId)
    const v1 = prepareMetArtifact(
      first.ctx.tianwenEvolution,
      V1,
      'human-v1',
      RECEIPT_A,
    )
    await first.ctx.tianwenEvolution.promote(first.agent, v1.artifactId)
    await first.ctx.fiber.dispose()

    const second = await mountEvolution(root, agentId)
    try {
      const ledgerPath = join(root, 'ledger.jsonl')
      rmSync(ledgerPath)
      mkdirSync(ledgerPath)
      vi.spyOn(second.ctx.dynamicCordisRunner, 'run').mockResolvedValue({
        ok: false,
        reason: 'host-half-failed',
        message: 'forced rehydrate failure',
      })

      await expect(
        second.ctx.tianwenEvolution.rehydrateChampion(second.agent),
      ).rejects.toBeInstanceOf(EvolutionRecoveryError)
      expect(second.ctx.tianwenEvolution.blocked).toBe(true)
      expect(second.ctx.tianwenEvolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
    } finally {
      await second.ctx.fiber.dispose()
    }
  })

  it('keeps rehydrated Champion active but blocks when runtime-bound audit cannot append', async () => {
    const root = ledgerRoot('rehydrate-binding-audit')
    const agentId = `rehydrate-binding-${randomUUID()}`
    const first = await mountEvolution(root, agentId)
    const v1 = prepareMetArtifact(
      first.ctx.tianwenEvolution,
      V1,
      'human-v1',
      RECEIPT_A,
    )
    await first.ctx.tianwenEvolution.promote(first.agent, v1.artifactId)
    await first.ctx.fiber.dispose()

    const second = await mountEvolution(root, agentId)
    try {
      const ledgerPath = join(root, 'ledger.jsonl')
      rmSync(ledgerPath)
      mkdirSync(ledgerPath)

      await expect(
        second.ctx.tianwenEvolution.rehydrateChampion(second.agent),
      ).rejects.toBeInstanceOf(EvolutionRecoveryError)
      expect(second.ctx.tianwenEvolution.blocked).toBe(true)
      expect(second.ctx.tianwenEvolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
      expect(second.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        activeRun: {},
        currentPackageId: expect.any(String),
      }])
    } finally {
      await second.ctx.fiber.dispose()
    }
  })

  it('blocks with the committed Champion active when atomic pointer replace fails', async () => {
    const root = ledgerRoot('pointer-commit-error')
    const agentId = `pointer-commit-${randomUUID()}`
    const mounted = await mountEvolution(root, agentId)
    const evolution = mounted.ctx.tianwenEvolution

    try {
      const v1 = prepareMetArtifact(
        evolution,
        V1,
        'human-v1',
        RECEIPT_A,
      )
      syncAudit.failChampionRenames = 1

      await expect(
        evolution.promote(mounted.agent, v1.artifactId),
      ).rejects.toBeInstanceOf(EvolutionRecoveryError)
      expect(evolution.blocked).toBe(true)
      expect(evolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
      expect(mounted.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        activeRun: {},
        currentPackageId: expect.any(String),
      }])
      expect(() => new EvolutionLedger(root)).not.toThrow()
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('blocks without recovery when transition fsync reports an unknown commit', async () => {
    const root = ledgerRoot('transition-commit-unknown')
    const mounted = await mountEvolution(root)
    const evolution = mounted.ctx.tianwenEvolution

    try {
      const v1 = prepareMetArtifact(
        evolution,
        V1,
        'human-v1',
        RECEIPT_A,
      )
      syncAudit.enabled = true
      syncAudit.failLedgerFsyncAfterReal = 1

      await expect(
        evolution.promote(mounted.agent, v1.artifactId),
      ).rejects.toBeInstanceOf(EvolutionRecoveryError)
      expect(evolution.blocked).toBe(true)
      expect(mounted.ctx.dynamicCordisRunner.inventory()).toMatchObject([{
        activeRun: {},
        currentPackageId: expect.any(String),
      }])
      const durableEvents = readFileSync(
        join(root, 'ledger.jsonl'),
        'utf8',
      ).trimEnd().split('\n').map(line => JSON.parse(line) as LedgerEvent)
      expect(eventTypes(durableEvents).at(-1)).toBe('promoted')
      expect(eventTypes(durableEvents)).not.toContain('activation-failed')

      const replayed = new EvolutionLedger(root)
      expect(replayed.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('completes a short ledger write before fsync and formal apply', async () => {
    const root = ledgerRoot('short-ledger-write')
    const mounted = await mountEvolution(root)
    const evolution = mounted.ctx.tianwenEvolution

    try {
      const v1 = prepareMetArtifact(
        evolution,
        V1,
        'human-v1',
        RECEIPT_A,
      )
      syncAudit.enabled = true
      syncAudit.shortLedgerWrites = 1

      await evolution.promote(mounted.agent, v1.artifactId)

      const replayed = new EvolutionLedger(root)
      expect(replayed.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('completes a short pointer write before atomic replace', async () => {
    const root = ledgerRoot('short-pointer-write')
    const mounted = await mountEvolution(root)
    const evolution = mounted.ctx.tianwenEvolution

    try {
      const v1 = prepareMetArtifact(
        evolution,
        V1,
        'human-v1',
        RECEIPT_A,
      )
      syncAudit.enabled = true
      syncAudit.shortPointerWrites = 1

      await evolution.promote(mounted.agent, v1.artifactId)

      const replayed = new EvolutionLedger(root)
      expect(replayed.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })
})
