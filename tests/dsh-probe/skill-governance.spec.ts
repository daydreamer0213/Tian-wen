import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LedgerIntegrityError,
  type RunBindingInput,
  type RunSkillUseInput,
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

    const restarted = new EvolutionLedger(directory)
    expect(restarted.listRunSkillManifests())
      .toEqual(ledger.listRunSkillManifests())
    expect(restarted.listRunSkillUses()).toEqual(ledger.listRunSkillUses())
  })
})
