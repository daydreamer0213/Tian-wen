import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import {
  EvolutionLedger,
  LedgerIntegrityError,
  isPublicLedgerEvent,
} from '../../packages/tianwen-evolution/src/ledger.js'
import type { LedgerEvent } from '../../packages/tianwen-evolution/src/index.js'

type AssertNever<T extends never> = T
type SkillEvalProtocolStaysPrivate = AssertNever<Extract<
  LedgerEvent,
  { type: 'skill-eval-protocol-frozen' }
>>

const roots: string[] = []
const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const
const parent = {
  name: 'research-summary',
  description: 'Summarize one research observation',
  whenToUse: 'When a task asks for a concise research summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Research summary\n\nState the observed result before interpretation.',
} as const

const digest = (character: string) =>
  `sha256:${character.repeat(64)}` as const

function root(prefix: string): string {
  const parentRoot = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'skill-evaluation-ledgers',
  )
  mkdirSync(parentRoot, { recursive: true })
  const value = mkdtempSync(join(parentRoot, `${prefix}-`))
  roots.push(value)
  return value
}

function protocol() {
  return {
    cases: [
      {
        caseId: 'eval-case:problem',
        category: 'problem',
        inputDigest: digest('1'),
        dataSnapshotDigest: digest('2'),
        acceptanceContract: acceptance,
      },
      {
        caseId: 'eval-case:regression',
        category: 'regression',
        inputDigest: digest('3'),
        dataSnapshotDigest: digest('4'),
        acceptanceContract: acceptance,
      },
      {
        caseId: 'eval-case:counterexample',
        category: 'counterexample',
        inputDigest: digest('5'),
        dataSnapshotDigest: digest('6'),
        acceptanceContract: acceptance,
      },
      {
        caseId: 'eval-case:safety',
        category: 'safety',
        inputDigest: digest('7'),
        dataSnapshotDigest: digest('8'),
        acceptanceContract: acceptance,
      },
    ],
    armOrder: 'baseline-then-candidate',
    repetition: { attempts: 1, reducer: 'all-attempts-must-pass' },
    hardGates: ['problem', 'regression', 'counterexample', 'safety'],
    softMetrics: ['model-requests', 'tool-calls'],
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
      providerId: 'scripted-adapter',
      modelId: 'tianwen-probe',
      toolSchemaDigest: digest('9'),
      permissionDigest: digest('a'),
      validatorContractDigest: digest('b'),
    },
  } as const
}

function seedOpenTicket(ledger: EvolutionLedger) {
  const outcomes = ['first', 'second'].map((suffix, index) => {
    const binding = ledger.recordRunBinding({
      goalRef: 'goal:research-preview',
      taskRef: `task:${suffix}`,
      sessionId: `session:${suffix}`,
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract: acceptance,
    })
    ledger.recordRunSkillManifest({ runId: binding.runId, skill: parent })
    return ledger.recordOutcomeIntake({
      runId: binding.runId,
      verdict: 'not-met',
      sessionDigest: digest(index === 0 ? 'c' : 'd'),
      evidenceIds: [digest(index === 0 ? 'e' : 'f')],
    })
  })
  return outcomes[1].ticketId!
}

afterEach(() => {
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true })
  }
})

describe('paired Skill evaluation protocol', () => {
  it('freezes one complete Ticket-scoped protocol before a Case', () => {
    const ledger = new EvolutionLedger(root('pre-candidate'))
    const ticketId = seedOpenTicket(ledger)
    const input = { ticketId, protocol: protocol() }

    const first = ledger.freezeSkillEvalProtocol(input)
    const expectedId = `eval-protocol:${sha256({
      ticketId,
      scopeKey: 'project:tianwen/capability:research-summary',
      protocol: input.protocol,
    }).slice('sha256:'.length)}`
    expect(first).toEqual({
      protocolId: expectedId,
      provenance: 'pre-candidate',
      duplicate: false,
    })
    expect(ledger.getSkillEvalProtocol(first.protocolId)).toMatchObject({
      protocolId: expectedId,
      ticketId,
      scopeKey: 'project:tianwen/capability:research-summary',
      provenance: 'pre-candidate',
      protocol: input.protocol,
    })
    expect(ledger.freezeSkillEvalProtocol(structuredClone(input)))
      .toEqual({ ...first, duplicate: true })

    const copy = ledger.getSkillEvalProtocol(first.protocolId)!
    ;(copy.protocol.cases as { caseId: string }[])[0]!.caseId = 'changed-copy'
    expect(ledger.getSkillEvalProtocol(first.protocolId)?.protocol.cases[0]?.caseId)
      .toBe('eval-case:problem')

    ledger.openLearningCase({ ticketId, counterevidenceRunIds: [] })
    const retrospective = ledger.freezeSkillEvalProtocol({
      ticketId,
      protocol: {
        ...protocol(),
        softMetrics: ['model-requests'],
      },
    })
    expect(retrospective).toMatchObject({
      provenance: 'retrospective',
      duplicate: false,
    })
  })

  it('rejects incomplete, caller-authored, or unsafe protocols before append', () => {
    const ledger = new EvolutionLedger(root('invalid'))
    const ticketId = seedOpenTicket(ledger)
    const complete = protocol()

    const invalid = [
      { ...complete, cases: complete.cases.slice(0, 3) },
      {
        ...complete,
        cases: [complete.cases[0], complete.cases[0], ...complete.cases.slice(2)],
      },
      { ...complete, repetition: { attempts: 0, reducer: 'all-attempts-must-pass' } },
      { ...complete, execution: { ...complete.execution, providerId: 'https://secret@example.test/path?token=x' } },
      { ...complete, rawPrompt: 'never persisted' },
    ]
    for (const value of invalid) {
      expect(() => ledger.freezeSkillEvalProtocol({ ticketId, protocol: value }))
        .toThrow()
    }
    expect(() => ledger.freezeSkillEvalProtocol({
      ticketId,
      protocol: complete,
      provenance: 'pre-candidate',
    })).toThrow()
    expect(ledger.listSkillEvalProtocols()).toEqual([])
  })

  it('rejects a 24-arm aggregate budget that expands past the evaluation CNY cap', () => {
    const ledger = new EvolutionLedger(root('aggregate-budget'))
    const ticketId = seedOpenTicket(ledger)
    const belowFixedMatrixMinimum = {
      ...protocol(),
      repetition: { attempts: 3, reducer: 'all-attempts-must-pass' },
      budget: {
        ...protocol().budget,
        maxTotalModelRequests: 71,
        maxTotalTokens: 48_000,
        maxTotalToolCalls: 48,
        maxTotalElapsedMs: 240_000,
      },
    }
    expect(() => ledger.freezeSkillEvalProtocol({
      ticketId,
      protocol: belowFixedMatrixMinimum,
    })).toThrow()

    const singleArmLegal = {
      ...protocol(),
      repetition: { attempts: 3, reducer: 'all-attempts-must-pass' },
      budget: {
        ...protocol().budget,
        maxCnyMilliPerArm: 3_000,
        maxTotalCnyMilli: 72_000,
        maxTotalModelRequests: 72,
        maxTotalTokens: 48_000,
        maxTotalToolCalls: 48,
        maxTotalElapsedMs: 240_000,
      },
    }
    expect(() => ledger.freezeSkillEvalProtocol({
      ticketId,
      protocol: singleArmLegal,
    })).toThrow()
  })

  it('replays only canonical protocol history and keeps the event private', () => {
    const directory = root('replay')
    const ledger = new EvolutionLedger(directory)
    const ticketId = seedOpenTicket(ledger)
    const receipt = ledger.freezeSkillEvalProtocol({
      ticketId,
      protocol: protocol(),
    })
    ledger.openLearningCase({ ticketId, counterevidenceRunIds: [] })
    ledger.freezeSkillEvalProtocol({
      ticketId,
      protocol: { ...protocol(), softMetrics: ['model-requests'] },
    })

    const restarted = new EvolutionLedger(directory)
    expect(restarted.getSkillEvalProtocol(receipt.protocolId))
      .toEqual(ledger.getSkillEvalProtocol(receipt.protocolId))
    expect(ledger.listEvents().filter(isPublicLedgerEvent)
      .some(event => event.type === 'skill-eval-protocol-frozen'))
      .toBe(false)

    const path = join(directory, 'ledger.jsonl')
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
    const event = JSON.parse(lines.at(-1)!) as {
      protocol: { provenance: string }
      inputDigest: string
    }
    event.protocol.provenance = 'pre-candidate'
    event.inputDigest = sha256(event.protocol)
    lines[lines.length - 1] = JSON.stringify(event)
    writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
    expect(() => new EvolutionLedger(directory)).toThrow(LedgerIntegrityError)
  })
})
