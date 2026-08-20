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
import { prepareRunBinding } from '../../packages/tianwen-evolution/src/outcome-intake.js'
import {
  EvolutionLedger,
  LedgerIntegrityError,
  isPublicLedgerEvent,
} from '../../packages/tianwen-evolution/src/ledger.js'
import { prepareSkillEvaluationResult } from '../../packages/tianwen-evolution/src/skill-evaluation.js'
import type { LedgerEvent } from '../../packages/tianwen-evolution/src/index.js'

type AssertNever<T extends never> = T
type SkillEvalEventsStayPrivate = AssertNever<Extract<
  LedgerEvent,
  {
    type:
      | 'skill-eval-protocol-frozen'
      | 'skill-evaluation-opened'
      | 'skill-evaluation-result-recorded'
  }
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

function seedCandidateWithProtocol(ledger: EvolutionLedger) {
  const seeded = [
    ['candidate-first', 'not-met', 'c', 'd'],
    ['candidate-second', 'not-met', 'e', 'f'],
    ['candidate-counterexample', 'met', 'a', 'b'],
  ] as const
  const runs = seeded.map(([suffix, verdict, sessionCharacter, evidenceCharacter]) => {
    const sessionId = `session:${suffix}`
    const binding = ledger.recordRunBinding({
      goalRef: 'goal:research-preview',
      taskRef: `task:${suffix}`,
      sessionId,
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract: acceptance,
    })
    const manifest = ledger.recordRunSkillManifest({ runId: binding.runId, skill: parent })
    const sessionDigest = digest(sessionCharacter)
    const acceptanceEvidenceId = digest(evidenceCharacter)
    const outcome = ledger.recordOutcomeIntake({
      runId: binding.runId,
      verdict,
      sessionDigest,
      evidenceIds: [acceptanceEvidenceId],
    })
    ledger.recordRunSkillUse({
      runId: binding.runId,
      parentVersionId: manifest.parentVersionId,
      sessionId,
      sessionDigest,
      skillName: parent.name,
      contentDigest: ledger.getRunSkillManifest(binding.runId)!.contentDigest,
      skillEvidenceId: digest(sessionCharacter),
      acceptanceEvidenceId,
      skillCallSeq: 10,
      skillResultSeq: 11,
      acceptanceCallSeq: 12,
    })
    return { ...binding, outcome, acceptanceEvidenceId }
  })
  const ticketId = runs[1]!.outcome.ticketId!
  const protocolReceipt = ledger.freezeSkillEvalProtocol({ ticketId, protocol: protocol() })
  const opened = ledger.openLearningCase({
    ticketId,
    counterevidenceRunIds: [runs[2]!.runId],
  })
  const learningCase = ledger.getLearningCase(opened.caseId)!
  const attribution = ledger.recordAttribution({
    caseId: opened.caseId,
    resolution: 'dsh-skill',
    targetSkillName: parent.name,
    hypothesis: 'The parent instruction omits result-first ordering.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    alternatives: 'Tool and Runtime causes remain unsupported.',
  })
  const lesson = ledger.recordAcceptedLesson({
    caseId: opened.caseId,
    attributionId: attribution.attributionId,
    claim: 'State the observed result before interpretation.',
    when: 'When summarizing a verified research observation.',
    notWhen: 'When the task requests raw extraction without interpretation.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    targetScope: learningCase.scopeKey,
  })
  const candidate = ledger.recordSkillCandidate({
    lessonId: lesson.lessonId,
    payload: {
      name: parent.name,
      description: 'Summarize verified observations with result-first ordering.',
      whenToUse: 'When summarizing a verified result.',
      invocation: parent.invocation,
      source: parent.source,
      content: '# Research summary\n\nState the observed result first, then interpret it.',
    },
    evidenceIds: [
      ...learningCase.supportingEvidenceIds,
      ...learningCase.counterevidence.flatMap(item => item.evidenceIds),
    ],
  })
  return {
    candidateId: candidate.candidateId,
    protocolId: protocolReceipt.protocolId,
    parentVersionId: learningCase.parentVersionId,
  }
}

function environment() {
  return {
    dshVersion: '0.1.0-rc.7',
    providerId: 'scripted-adapter',
    modelId: 'tianwen-probe',
    callConfigDigest: digest('c'),
    toolSchemaDigest: digest('9'),
    permissionDigest: digest('a'),
    workspaceSnapshotDigest: digest('b'),
    validatorContractDigest: digest('b'),
    budget: protocol().budget,
  } as const
}

function plannedArms() {
  return protocol().cases.map(({ caseId }) => ({
    caseId,
    attempt: 1,
    baseline: plannedBinding(caseId, 'baseline'),
    candidate: plannedBinding(caseId, 'candidate'),
  }))
}

function plannedBinding(caseId: string, role: 'baseline' | 'candidate') {
  const sessionId = `session:eval-${role}-${caseId.slice('eval-case:'.length)}`
  const binding = prepareRunBinding({
    goalRef: 'goal:research-preview',
    taskRef: `task:eval-${role}-${caseId.slice('eval-case:'.length)}`,
    sessionId,
    scopeKey: 'project:tianwen/capability:research-summary',
    acceptanceContract: acceptance,
  })
  return { runId: binding.runId, sessionId }
}

function observedArm(
  plan: { readonly role: 'baseline' | 'candidate'; readonly runId: string; readonly sessionId: string },
  outcome: 'met' | 'not-met' | 'inconclusive',
  character: string,
) {
  return {
    role: plan.role,
    runId: plan.runId,
    sessionId: plan.sessionId,
    skillVersionId: `skill-version:${character.repeat(64)}`,
    contentDigest: digest(character),
    executionManifestDigest: digest('a'),
    fullRequestDigest: digest(character),
    normalizedFirstRequestDigest: digest('b'),
    injectionProofDigest: digest('c'),
    outcome,
    evidenceIds: [digest('d')],
    validatorReceiptDigest: digest('e'),
    evaluatedSubjectDigest: digest('f'),
    usage: { modelRequests: 0, tokens: 0, toolCalls: 0, elapsedMs: 0, cnyMilli: 0 },
  } as const
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

  it('opens one complete deterministic B/C plan from the durable Candidate chain', () => {
    const ledger = new EvolutionLedger(root('paired-plan'))
    const chain = seedCandidateWithProtocol(ledger)
    const first = ledger.openSkillEvaluation({
      candidateId: chain.candidateId,
      protocolId: chain.protocolId,
      environment: environment(),
      arms: plannedArms(),
    })
    const plan = ledger.getSkillEvaluation(first.evaluationId)
    expect(first).toEqual({ evaluationId: plan!.evaluationId, duplicate: false })
    expect(plan).toMatchObject({
      candidateId: chain.candidateId,
      protocolId: chain.protocolId,
      parentVersionId: chain.parentVersionId,
      protocolProvenance: 'pre-candidate',
      cases: expect.arrayContaining([
        expect.objectContaining({
          category: 'problem',
          attempt: 1,
          baseline: expect.objectContaining({ role: 'baseline' }),
          candidate: expect.objectContaining({ role: 'candidate' }),
        }),
      ]),
    })
    expect(new Set(plan!.cases.flatMap(item => [item.baseline.runId, item.candidate.runId])).size)
      .toBe(8)
    expect(ledger.openSkillEvaluation({
      candidateId: chain.candidateId,
      protocolId: chain.protocolId,
      environment: environment(),
      arms: plannedArms(),
    })).toEqual({ ...first, duplicate: true })
  })

  it('reduces hard-gate verdicts and comparisons without conflating failure and uncertainty', () => {
    const ledger = new EvolutionLedger(root('paired-reduction'))
    const chain = seedCandidateWithProtocol(ledger)
    const receipt = ledger.openSkillEvaluation({
      candidateId: chain.candidateId,
      protocolId: chain.protocolId,
      environment: { ...environment(), providerId: 'observed-provider' },
      arms: plannedArms(),
    })
    const plan = ledger.getSkillEvaluation(receipt.evaluationId)!
    const outcomes = [
      ['met', 'met'],
      ['not-met', 'not-met'],
      ['not-met', 'met'],
      ['met', 'inconclusive'],
    ] as const
    const result = prepareSkillEvaluationResult({
      evaluationId: plan.evaluationId,
      cases: plan.cases.map((item, index) => ({
        caseId: item.caseId,
        attempt: item.attempt,
        baseline: observedArm(item.baseline, outcomes[index]![0], '1'),
        candidate: observedArm(item.candidate, outcomes[index]![1], '2'),
      })),
      baselineResolutionMatched: true,
      trustedExecution: { kind: 'observed-provider' },
    }, plan)
    expect(result).toMatchObject({
      verdict: 'FAIL',
      comparison: 'not-comparable',
      decision: 'candidate-hard-gate-failed',
      evidenceClass: 'objective-screening',
    })
    expect(result.reasonCodes).not.toContain('scripted-model-output')
    expect(result.cases.map(item => [item.verdict, item.comparison])).toEqual([
      ['PASS', 'tie'],
      ['FAIL', 'tie'],
      ['PASS', 'candidate-better'],
      ['INCONCLUSIVE', 'not-comparable'],
    ])
  })

  it('records, replays, and keeps the immutable aggregate result private', () => {
    const directory = root('paired-result')
    const ledger = new EvolutionLedger(directory)
    const chain = seedCandidateWithProtocol(ledger)
    const opened = ledger.openSkillEvaluation({
      candidateId: chain.candidateId,
      protocolId: chain.protocolId,
      environment: environment(),
      arms: plannedArms(),
    })
    const plan = ledger.getSkillEvaluation(opened.evaluationId)!
    for (const evaluationCase of plan.cases) {
      for (const role of ['baseline', 'candidate'] as const) {
        const binding = plannedBinding(evaluationCase.caseId, role)
        expect(binding.runId).toBe(evaluationCase[role].runId)
        ledger.recordRunBinding({
          goalRef: 'goal:research-preview',
          taskRef: `task:eval-${role}-${evaluationCase.caseId.slice('eval-case:'.length)}`,
          sessionId: binding.sessionId,
          scopeKey: plan.scopeKey,
          acceptanceContract: evaluationCase.acceptanceContract,
        })
        ledger.recordOutcomeIntake({
          runId: binding.runId,
          verdict: 'met',
          sessionDigest: digest(role === 'baseline' ? '1' : '2'),
          evidenceIds: [digest('d')],
        })
      }
    }
    const input = {
      evaluationId: plan.evaluationId,
      cases: plan.cases.map(item => ({
        caseId: item.caseId,
        attempt: item.attempt,
        baseline: observedArm(item.baseline, 'met', '1'),
        candidate: observedArm(item.candidate, 'met', '2'),
      })),
      baselineResolutionMatched: true,
      trustedExecution: { kind: 'scripted-adapter' as const },
    }
    const first = ledger.recordSkillEvaluationResult(input)
    expect(first).toEqual({ evaluationId: plan.evaluationId, duplicate: false })
    expect(ledger.recordSkillEvaluationResult(structuredClone(input)))
      .toEqual({ ...first, duplicate: true })
    expect(ledger.getSkillEvaluationResult(first.evaluationId)).toMatchObject({
      verdict: 'INCONCLUSIVE',
      comparison: 'not-comparable',
      decision: 'needs-evidence',
      evidenceClass: 'scripted-mechanism',
    })
    expect(new EvolutionLedger(directory).getSkillEvaluationResult(first.evaluationId))
      .toEqual(ledger.getSkillEvaluationResult(first.evaluationId))
    expect(ledger.listEvents().filter(isPublicLedgerEvent).map(event => event.type))
      .not.toContain('skill-evaluation-result-recorded')

    const path = join(directory, 'ledger.jsonl')
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
    const event = JSON.parse(lines.at(-1)!) as {
      result: { comparison: string }
      inputDigest: string
    }
    event.result.comparison = 'candidate-better'
    event.inputDigest = sha256(event.result)
    lines[lines.length - 1] = JSON.stringify(event)
    writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
    expect(() => new EvolutionLedger(directory)).toThrow(LedgerIntegrityError)
  })
})
