import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { renderSkillContent } from '@tianwen/dsh-compat'
import {
  LedgerIntegrityError,
  sha256,
  type RunBindingInput,
  type RunSkillUseInput,
  type RunSkillUseV2Input,
  type TianwenRunId,
} from '../../packages/tianwen-evolution/src/index.js'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'

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
    'skill-governance-ledgers',
  )
  mkdirSync(parentRoot, { recursive: true })
  const value = mkdtempSync(join(parentRoot, `${prefix}-`))
  roots.push(value)
  return value
}

function bindReusableRun(
  ledger: EvolutionLedger,
  sessionId: string,
): { readonly runId: TianwenRunId } {
  const input: RunBindingInput = {
    goalRef: 'goal:research-preview',
    taskRef: `task:${sessionId}`,
    sessionId,
    scopeKey: 'project:tianwen/capability:research-summary',
    acceptanceContract: acceptance,
  }
  return ledger.recordRunBinding(input)
}

function seedMetOutcomeWithManifest(
  ledger: EvolutionLedger,
  sessionId: string,
) {
  const { runId } = bindReusableRun(ledger, sessionId)
  const manifest = ledger.recordRunSkillManifest({ runId, skill: parent })
  const sessionDigest = digest('1')
  const acceptanceEvidenceId = digest('a')
  ledger.recordOutcomeIntake({
    runId,
    verdict: 'met',
    sessionDigest,
    evidenceIds: [acceptanceEvidenceId],
  })
  return {
    runId,
    sessionId,
    sessionDigest,
    acceptanceEvidenceId,
    parentVersionId: manifest.parentVersionId,
    contentDigest: ledger.getRunSkillManifest(runId)!.contentDigest,
  }
}

function useInput(
  seeded: ReturnType<typeof seedMetOutcomeWithManifest>,
): RunSkillUseInput {
  return {
    runId: seeded.runId,
    parentVersionId: seeded.parentVersionId,
    sessionId: seeded.sessionId,
    sessionDigest: seeded.sessionDigest,
    skillName: parent.name,
    contentDigest: seeded.contentDigest,
    skillEvidenceId: digest('b'),
    acceptanceEvidenceId: seeded.acceptanceEvidenceId,
    skillCallSeq: 10,
    skillResultSeq: 11,
    acceptanceCallSeq: 12,
  }
}

function directUseInput(
  seeded: ReturnType<typeof seedMetOutcomeWithManifest>,
): RunSkillUseV2Input {
  return {
    runId: seeded.runId,
    parentVersionId: seeded.parentVersionId,
    sessionId: seeded.sessionId,
    sessionDigest: seeded.sessionDigest,
    skillName: parent.name,
    contentDigest: seeded.contentDigest,
    skillEvidenceId: sha256({
      schemaVersion: 'tianwen.direct-skill-invocation-evidence.v1',
      sessionId: seeded.sessionId,
      invocationMessageSeq: 10,
      sourceMessageId: 'message:skill-invocation',
      skillName: parent.name,
      renderedContentDigest: sha256(renderSkillContent(parent)),
    }),
    acceptanceEvidenceId: seeded.acceptanceEvidenceId,
    provenance: {
      kind: 'direct-invocation',
      invocationMessageSeq: 10,
      sourceMessageId: 'message:skill-invocation',
    },
    acceptanceCallSeq: 12,
  }
}

function seedGovernedCase(
  ledger: EvolutionLedger,
  options: {
    readonly withUses?: boolean
    readonly counterevidence?: boolean
  } = {},
) {
  const withUses = options.withUses ?? true
  const runs = [
    ['case-failure-1', 'not-met', '3', 'c'],
    ['case-failure-2', 'not-met', '4', 'd'],
    ['case-success', 'met', '5', 'e'],
  ] as const
  const seeded = runs.map(([session, verdict, sessionCharacter, evidenceCharacter]) => {
    const sessionId = `session:${session}`
    const { runId } = bindReusableRun(ledger, sessionId)
    const manifest = ledger.recordRunSkillManifest({ runId, skill: parent })
    const sessionDigest = digest(sessionCharacter)
    const acceptanceEvidenceId = digest(evidenceCharacter)
    const outcome = ledger.recordOutcomeIntake({
      runId,
      verdict,
      sessionDigest,
      evidenceIds: [acceptanceEvidenceId],
    })
    const input: RunSkillUseInput = {
      runId,
      parentVersionId: manifest.parentVersionId,
      sessionId,
      sessionDigest,
      skillName: parent.name,
      contentDigest: ledger.getRunSkillManifest(runId)!.contentDigest,
      skillEvidenceId: digest(verdict === 'met' ? '8' : sessionCharacter),
      acceptanceEvidenceId,
      skillCallSeq: 10,
      skillResultSeq: 11,
      acceptanceCallSeq: 12,
    }
    if (withUses) {
      ledger.recordRunSkillUse(input)
    }
    return { runId, acceptanceEvidenceId, outcome, use: input }
  })
  const ticketId = seeded[1].outcome.ticketId!
  const opened = ledger.openLearningCase({
    ticketId,
    counterevidenceRunIds: options.counterevidence === false
      ? []
      : [seeded[2].runId],
  })
  const value = ledger.getLearningCase(opened.caseId)!
  return {
    caseId: opened.caseId,
    ticketId,
    value,
    supportingEvidenceIds: value.supportingEvidenceIds,
    counterevidenceIds: value.counterevidence.flatMap(item => item.evidenceIds),
  }
}

function seedResolvedAttribution(ledger: EvolutionLedger) {
  const seeded = seedGovernedCase(ledger)
  const receipt = ledger.recordAttribution({
    caseId: seeded.caseId,
    resolution: 'dsh-skill',
    targetSkillName: parent.name,
    hypothesis: 'The parent instruction omits result-first ordering.',
    supportingEvidenceIds: seeded.supportingEvidenceIds,
    counterevidenceIds: seeded.counterevidenceIds,
    alternatives: 'Tool and Runtime causes remain unsupported.',
  })
  return {
    ...seeded,
    attributionId: receipt.attributionId,
    scopeKey: seeded.value.scopeKey,
    parentVersionId: seeded.value.parentVersionId,
    parent: ledger.getRunSkillManifest(seeded.value.runIds[0]!)!.parent,
  }
}

function seedAcceptedLesson(ledger: EvolutionLedger) {
  const chain = seedResolvedAttribution(ledger)
  const receipt = ledger.recordAcceptedLesson({
    caseId: chain.caseId,
    attributionId: chain.attributionId,
    claim: 'State the observed result before interpretation.',
    when: 'When summarizing a verified research observation.',
    notWhen: 'When the task requests raw extraction without interpretation.',
    supportingEvidenceIds: chain.supportingEvidenceIds,
    counterevidenceIds: chain.counterevidenceIds,
    targetScope: chain.scopeKey,
  })
  return { ...chain, lessonId: receipt.lessonId }
}

afterEach(() => {
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true })
  }
})

describe('governed Skill evidence', () => {
  it('freezes the complete pure-text parent and rejects sidecars', () => {
    const ledger = new EvolutionLedger(root('manifest'))
    const runId = bindReusableRun(ledger, 'session:manifest-1').runId
    const first = ledger.recordRunSkillManifest({ runId, skill: parent })
    expect(first).toMatchObject({ duplicate: false })
    expect(first.parentVersionId).toMatch(/^skill-version:[a-f0-9]{64}$/u)
    expect(ledger.getRunSkillManifest(runId)?.parent).toEqual({
      name: parent.name,
      description: parent.description,
      whenToUse: parent.whenToUse,
      invocation: parent.invocation,
      source: parent.source,
      content: parent.content,
    })
    expect(ledger.recordRunSkillManifest({
      runId,
      skill: structuredClone(parent),
    })).toMatchObject({ duplicate: true })
    expect(() => ledger.recordRunSkillManifest({
      runId,
      skill: {
        ...parent,
        resourceBase: { kind: 'url', url: 'https://invalid.test' },
      },
    })).toThrow()
    expect(() => ledger.recordRunSkillManifest({
      runId,
      skill: { ...parent, content: `${parent.content}\nchanged` },
    })).toThrow(LedgerIntegrityError)
  })

  it('records one post-Outcome use reference and rejects changed replay', () => {
    const ledger = new EvolutionLedger(root('use'))
    const seeded = seedMetOutcomeWithManifest(ledger, 'session:use-1')
    const input = useInput(seeded)
    expect(ledger.recordRunSkillUse(input)).toMatchObject({ duplicate: false })
    expect(ledger.recordRunSkillUse(structuredClone(input)))
      .toMatchObject({ duplicate: true })
    expect(() => ledger.recordRunSkillUse({ ...input, skillCallSeq: 9 }))
      .toThrow(LedgerIntegrityError)
  })

  it('records and replays direct invocation provenance without rewriting v1 uses', () => {
    const directory = root('direct-use')
    const ledger = new EvolutionLedger(directory)
    const seeded = seedMetOutcomeWithManifest(ledger, 'session:direct-use')
    const input = directUseInput(seeded)

    expect(ledger.recordRunSkillUse(input)).toMatchObject({ duplicate: false })
    expect(ledger.getRunSkillUse(seeded.runId)).toEqual({
      schemaVersion: 'tianwen.run-skill-use.v2',
      ...input,
    })
    expect(new EvolutionLedger(directory).getRunSkillUse(seeded.runId))
      .toEqual(ledger.getRunSkillUse(seeded.runId))

    const source = readFileSync(join(directory, 'ledger.jsonl'), 'utf8')
    expect(source).toContain('"schemaVersion":"tianwen.run-skill-use.v2"')
    expect(source).toContain('"schemaVersion":"tianwen.run-skill-use.v1","type":"run-skill-use-recorded"')
  })

  it('rejects altered direct invocation provenance and v1-v2 duplicate conflicts', () => {
    const ledger = new EvolutionLedger(root('invalid-direct-use'))
    const seeded = seedMetOutcomeWithManifest(ledger, 'session:invalid-direct-use')
    const valid = directUseInput(seeded)
    const invalid = [
      { ...valid, acceptanceCallSeq: 10 },
      { ...valid, provenance: { ...valid.provenance, invocationMessageSeq: 12 } },
      { ...valid, provenance: { ...valid.provenance, sourceMessageId: ' ' } },
      { ...valid, acceptanceEvidenceId: digest('d') },
      {
        ...valid,
        provenance: { kind: 'skill-tool', callSeq: 10, resultSeq: 12 },
        acceptanceCallSeq: 11,
      },
    ]
    for (const input of invalid) {
      expect(() => ledger.recordRunSkillUse(input as RunSkillUseV2Input))
        .toThrow(LedgerIntegrityError)
    }

    expect(ledger.recordRunSkillUse(valid)).toMatchObject({ duplicate: false })
    expect(() => ledger.recordRunSkillUse(useInput(seeded)))
      .toThrow(LedgerIntegrityError)
  })

  it('reads a defensive copy of one stored Run Skill use', () => {
    const ledger = new EvolutionLedger(root('get-use'))
    const seeded = seedMetOutcomeWithManifest(ledger, 'session:get-use')
    ledger.recordRunSkillUse(useInput(seeded))

    const stored = ledger.getRunSkillUse(seeded.runId)!
    expect(stored).toMatchObject({
      runId: seeded.runId,
      parentVersionId: seeded.parentVersionId,
      skillName: parent.name,
    })
    ;(stored as { skillName: string }).skillName = 'changed-copy'
    expect(ledger.getRunSkillUse(seeded.runId)?.skillName).toBe(parent.name)
    expect(ledger.getRunSkillUse(`run:${'f'.repeat(64)}`)).toBeUndefined()
  })

  it('rejects missing or contradictory Run, Outcome, and sequence facts', () => {
    const ledger = new EvolutionLedger(root('invalid-use'))
    expect(() => ledger.recordRunSkillManifest({
      runId: `run:${'f'.repeat(64)}`,
      skill: parent,
    })).toThrow(LedgerIntegrityError)

    const noOutcome = bindReusableRun(ledger, 'session:no-outcome').runId
    const noOutcomeManifest = ledger.recordRunSkillManifest({
      runId: noOutcome,
      skill: parent,
    })
    expect(() => ledger.recordRunSkillUse({
      runId: noOutcome,
      parentVersionId: noOutcomeManifest.parentVersionId,
      sessionId: 'session:no-outcome',
      sessionDigest: digest('2'),
      skillName: parent.name,
      contentDigest: ledger.getRunSkillManifest(noOutcome)!.contentDigest,
      skillEvidenceId: digest('b'),
      acceptanceEvidenceId: digest('a'),
      skillCallSeq: 10,
      skillResultSeq: 11,
      acceptanceCallSeq: 12,
    })).toThrow(LedgerIntegrityError)

    const seeded = seedMetOutcomeWithManifest(ledger, 'session:validated')
    const valid = useInput(seeded)
    const invalid = [
      { ...valid, sessionId: 'session:other' },
      { ...valid, sessionDigest: digest('2') },
      { ...valid, parentVersionId: `skill-version:${'e'.repeat(64)}` as const },
      { ...valid, contentDigest: digest('c') },
      { ...valid, acceptanceEvidenceId: digest('d') },
      { ...valid, skillResultSeq: 13 },
      { ...valid, acceptanceCallSeq: 11 },
    ]
    for (const input of invalid) {
      expect(() => ledger.recordRunSkillUse(input))
        .toThrow(LedgerIntegrityError)
    }
    expect(ledger.listRunSkillUses()).toEqual([])
  })

  it('replays manifests and use references identically after restart', () => {
    const directory = root('restart')
    const ledger = new EvolutionLedger(directory)
    const seeded = seedMetOutcomeWithManifest(ledger, 'session:restart')
    ledger.recordRunSkillUse(useInput(seeded))
    const beforeRestart = readFileSync(join(directory, 'ledger.jsonl'), 'utf8')

    const restarted = new EvolutionLedger(directory)
    expect(restarted.listRunSkillManifests())
      .toEqual(ledger.listRunSkillManifests())
    expect(restarted.listRunSkillUses()).toEqual(ledger.listRunSkillUses())
    expect(readFileSync(join(directory, 'ledger.jsonl'), 'utf8'))
      .toBe(beforeRestart)
    expect(restarted.getRunSkillUse(seeded.runId)?.schemaVersion)
      .toBe('tianwen.run-skill-use.v1')
  })

  it('derives one Case only from Ticket facts and a related met Run', () => {
    const ledger = new EvolutionLedger(root('case'))
    const seeded = seedGovernedCase(ledger)
    expect(seeded.value).toMatchObject({
      ticketId: seeded.ticketId,
      learningMode: 'experience-consolidation',
      schedule: 'background',
      experimentLimit: 0,
      candidateLimit: 1,
      parentSkillName: parent.name,
    })
    expect(seeded.value.signalIds).toHaveLength(2)
    expect(seeded.value.runIds).toHaveLength(2)
    expect(seeded.value.supporting).toHaveLength(2)
    expect(seeded.value.counterevidence).toHaveLength(1)
    expect(seeded.value.counterevidence[0]?.skillUse).toBeDefined()
    expect(ledger.openLearningCase({
      ticketId: seeded.ticketId,
      counterevidenceRunIds: [seeded.value.counterevidence[0]!.runId],
    })).toMatchObject({ caseId: seeded.caseId, duplicate: true })
    expect(() => ledger.openLearningCase({
      ticketId: seeded.ticketId,
      counterevidenceRunIds: [],
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.openLearningCase({
      ticketId: `ticket:${'f'.repeat(64)}`,
      counterevidenceRunIds: [],
    })).toThrow(LedgerIntegrityError)
  })

  it('opens a Case for one immediate severe Signal and for zero counterevidence', () => {
    const ledger = new EvolutionLedger(root('bounded-case'))
    const severeAcceptance = { ...acceptance, severity: 4 as const }
    const bind = (sessionId: string) => ledger.recordRunBinding({
      goalRef: 'goal:research-preview',
      taskRef: `task:${sessionId}`,
      sessionId,
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract: severeAcceptance,
    })
    const failure = bind('session:severe-failure')
    ledger.recordRunSkillManifest({ runId: failure.runId, skill: parent })
    const failed = ledger.recordOutcomeIntake({
      runId: failure.runId,
      verdict: 'not-met',
      sessionDigest: digest('6'),
      evidenceIds: [digest('f')],
    })
    const success = bind('session:severe-success')
    ledger.recordRunSkillManifest({ runId: success.runId, skill: parent })
    ledger.recordOutcomeIntake({
      runId: success.runId,
      verdict: 'met',
      sessionDigest: digest('7'),
      evidenceIds: [digest('9')],
    })
    const opened = ledger.openLearningCase({
      ticketId: failed.ticketId!,
      counterevidenceRunIds: [success.runId],
    })
    expect(ledger.getLearningCase(opened.caseId)?.signalIds).toHaveLength(1)

    const noCounterLedger = new EvolutionLedger(root('no-counter-case'))
    const noCounter = seedGovernedCase(noCounterLedger, {
      withUses: false,
      counterevidence: false,
    })
    expect(noCounter.value.counterevidence).toEqual([])
    expect(noCounterLedger.recordAttribution({
      caseId: noCounter.caseId,
      resolution: 'unknown',
      reason: 'No related met Run is available yet.',
    })).toMatchObject({ decision: 'no-lesson' })
  })

  it('allows unknown without use proof but gates dsh-skill attribution', () => {
    const incompleteLedger = new EvolutionLedger(root('unknown-attribution'))
    const incomplete = seedGovernedCase(incompleteLedger, { withUses: false })
    expect(incompleteLedger.recordAttribution({
      caseId: incomplete.caseId,
      resolution: 'unknown',
      reason: 'The frozen evidence does not distinguish Skill from tool behavior.',
    })).toMatchObject({ duplicate: false, decision: 'no-lesson' })
    expect(() => incompleteLedger.recordAttribution({
      caseId: incomplete.caseId,
      resolution: 'dsh-skill',
      targetSkillName: parent.name,
      hypothesis: 'The parent instruction omits result-first ordering.',
      supportingEvidenceIds: incomplete.supportingEvidenceIds,
      counterevidenceIds: incomplete.counterevidenceIds,
      alternatives: 'Tool and Runtime causes remain unsupported.',
    })).toThrow(LedgerIntegrityError)

    const ledger = new EvolutionLedger(root('skill-attribution'))
    const complete = seedGovernedCase(ledger)
    const input = {
      caseId: complete.caseId,
      resolution: 'dsh-skill' as const,
      targetSkillName: parent.name,
      hypothesis: 'The parent instruction omits result-first ordering.',
      supportingEvidenceIds: complete.supportingEvidenceIds,
      counterevidenceIds: complete.counterevidenceIds,
      alternatives: 'Tool and Runtime causes remain unsupported.',
    }
    expect(ledger.recordAttribution(input))
      .toMatchObject({ duplicate: false, decision: 'resolved' })
    expect(ledger.recordAttribution(structuredClone(input)))
      .toMatchObject({ duplicate: true, decision: 'resolved' })
    expect(() => ledger.recordAttribution({
      ...input,
      targetSkillName: 'another-skill',
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.recordAttribution({
      ...input,
      supportingEvidenceIds: [digest('f')],
    })).toThrow(LedgerIntegrityError)
  })

  it('records outside-stage3 only with a nonblank recommendation', () => {
    const ledger = new EvolutionLedger(root('outside-attribution'))
    const seeded = seedGovernedCase(ledger, { withUses: false })
    expect(ledger.recordAttribution({
      caseId: seeded.caseId,
      resolution: 'outside-stage3',
      recommendation: 'Inspect the deterministic tool fixture separately.',
    })).toMatchObject({ decision: 'no-lesson', duplicate: false })
  })

  it('normalizes governance prose before deterministic Attribution identity', () => {
    const ledger = new EvolutionLedger(root('normalized-attribution'))
    const chain = seedGovernedCase(ledger)
    const padded = ledger.recordAttribution({
      caseId: chain.caseId,
      resolution: 'dsh-skill',
      targetSkillName: parent.name,
      hypothesis: '  The parent omits result-first ordering.  ',
      supportingEvidenceIds: chain.supportingEvidenceIds,
      counterevidenceIds: chain.counterevidenceIds,
      alternatives: '  Tool causes remain unsupported.  ',
    })
    expect(ledger.getAttribution(padded.attributionId)).toMatchObject({
      hypothesis: 'The parent omits result-first ordering.',
      alternatives: 'Tool causes remain unsupported.',
    })
    expect(ledger.recordAttribution({
      caseId: chain.caseId,
      resolution: 'dsh-skill',
      targetSkillName: parent.name,
      hypothesis: 'The parent omits result-first ordering.',
      supportingEvidenceIds: chain.supportingEvidenceIds,
      counterevidenceIds: chain.counterevidenceIds,
      alternatives: 'Tool causes remain unsupported.',
    })).toMatchObject({ attributionId: padded.attributionId, duplicate: true })
  })

  it('accepts a scoped Lesson only after dsh-skill attribution', () => {
    const ledger = new EvolutionLedger(root('lesson'))
    const chain = seedResolvedAttribution(ledger)
    const input = {
      caseId: chain.caseId,
      attributionId: chain.attributionId,
      claim: '  State the observed result before interpretation.  ',
      when: '  When summarizing a verified research observation.  ',
      notWhen: '  When the task requests raw extraction without interpretation.  ',
      supportingEvidenceIds: chain.supportingEvidenceIds,
      counterevidenceIds: chain.counterevidenceIds,
      targetScope: chain.scopeKey,
    } as const
    const receipt = ledger.recordAcceptedLesson(input)
    expect(receipt.lessonId).toMatch(/^lesson:[a-f0-9]{64}$/u)
    expect(ledger.getAcceptedLesson(receipt.lessonId)).toMatchObject({
      ...input,
      claim: input.claim.trim(),
      when: input.when.trim(),
      notWhen: input.notWhen.trim(),
      status: 'accepted',
    })
    expect(ledger.recordAcceptedLesson({
      ...structuredClone(input),
      claim: input.claim.trim(),
      when: input.when.trim(),
      notWhen: input.notWhen.trim(),
    }))
      .toMatchObject({ duplicate: true })
    expect(() => ledger.recordAcceptedLesson({ ...input, targetScope: 'other' }))
      .toThrow(LedgerIntegrityError)
    expect(() => ledger.recordAcceptedLesson({
      ...input,
      supportingEvidenceIds: [digest('f')],
    })).toThrow(LedgerIntegrityError)
  })

  it('records one inert Candidate without touching Artifact or Champion state', () => {
    const directory = root('candidate')
    const ledger = new EvolutionLedger(directory)
    const chain = seedAcceptedLesson(ledger)
    const beforeEvents = ledger.listEvents().map(event => event.type)
    const input = {
      lessonId: chain.lessonId,
      payload: {
        ...chain.parent,
        description: '  Summarize verified observations with result-first ordering.  ',
        whenToUse: '  When summarizing a verified result.  ',
        content: '  # Research summary\n\nState the observed result first, then interpret it.\n\nhttps://example.test and `echo inert` are plain text.\n',
      },
      evidenceIds: [...chain.supportingEvidenceIds, ...chain.counterevidenceIds],
    } as const
    const receipt = ledger.recordSkillCandidate(input)
    expect(receipt.candidateId).toMatch(/^candidate:[a-f0-9]{64}$/u)
    expect(ledger.getSkillCandidate(receipt.candidateId)).toMatchObject({
      parentVersionId: chain.parentVersionId,
      status: 'recorded',
      payload: {
        ...input.payload,
        description: input.payload.description.trim(),
        whenToUse: input.payload.whenToUse.trim(),
      },
    })
    expect(ledger.recordSkillCandidate({
      ...structuredClone(input),
      payload: {
        ...input.payload,
        description: input.payload.description.trim(),
        whenToUse: input.payload.whenToUse.trim(),
      },
    }))
      .toMatchObject({ duplicate: true })
    expect(() => ledger.recordSkillCandidate({
      ...input,
      evidenceIds: input.evidenceIds.slice(1),
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.recordSkillCandidate({
      ...input,
      payload: { ...input.payload, name: 'different-skill' },
    })).toThrow(LedgerIntegrityError)
    expect(ledger.getChampion()).toBeUndefined()
    const oldPath = [
      'artifact-recorded', 'evaluation-recorded', 'approval-recorded',
      'promoted', 'rolled-back', 'runtime-bound',
    ]
    expect(ledger.listEvents().map(event => event.type).filter(type =>
      oldPath.includes(type))).toEqual(beforeEvents.filter(type =>
      oldPath.includes(type)))
    const restarted = new EvolutionLedger(directory)
    expect([
      restarted.listRunSkillManifests(),
      restarted.listRunSkillUses(),
      restarted.listLearningCases(),
      restarted.listAttributions(),
      restarted.listAcceptedLessons(),
      restarted.listSkillCandidates(),
    ]).toEqual([
      ledger.listRunSkillManifests(),
      ledger.listRunSkillUses(),
      ledger.listLearningCases(),
      ledger.listAttributions(),
      ledger.listAcceptedLessons(),
      ledger.listSkillCandidates(),
    ])
  })

  it('fails closed when a persisted Stage 3 Candidate is tampered', () => {
    const directory = root('tampered-candidate')
    const ledger = new EvolutionLedger(directory)
    seedAcceptedLesson(ledger)
    const lesson = ledger.listAcceptedLessons()[0]!
    const learningCase = ledger.getLearningCase(lesson.caseId)!
    const parentPayload = ledger.getRunSkillManifest(learningCase.runIds[0]!)!.parent
    ledger.recordSkillCandidate({
      lessonId: lesson.lessonId,
      payload: { ...parentPayload, content: `${parentPayload.content}\nupdated` },
      evidenceIds: [
        ...lesson.supportingEvidenceIds,
        ...lesson.counterevidenceIds,
      ],
    })
    const path = join(directory, 'ledger.jsonl')
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
    const event = JSON.parse(lines.at(-1)!) as {
      candidate: { payload: { content: string } }
    }
    event.candidate.payload.content += '\ntampered'
    lines[lines.length - 1] = JSON.stringify(event)
    writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
    expect(() => new EvolutionLedger(directory)).toThrow(LedgerIntegrityError)
  })
})
