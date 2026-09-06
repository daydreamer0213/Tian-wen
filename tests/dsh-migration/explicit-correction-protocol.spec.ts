import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import * as runtimeBundle from '../../packages/tianwen-runtime-bundle/src/index.js'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY,
  CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY_DIGEST,
  CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
  prepareControlledSkillEvalProtocol,
  sha256,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  normalizeResearchSummarySubmission,
  parseResearchPacket,
} from '../../packages/tianwen-runtime/src/research-summary.js'
import {
  assertExplicitCorrectionWorkspaceSnapshot,
  buildExplicitCorrectionTransitionInput,
  EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
  EXPLICIT_CORRECTION_PROTOCOL_VERSION,
  resolveExplicitCorrectionProtocol,
} from '../../packages/tianwen-runtime-bundle/src/explicit-correction-protocol.js'

const fixtureRoots: string[] = []

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'tianwen-explicit-correction-protocol-'))
  fixtureRoots.push(root)
  return root
}

function materializeWorkspace(root: string, content: string): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'brief.txt'), content, 'utf8')
}

function sourceFidelityInput(sourceText: string) {
  const packet = parseResearchPacket(sourceText)
  const source = {
    signalId: `signal:${'1'.repeat(64)}`,
    sessionId: 'source-main',
    messageId: 'source-reply',
    feedbackVersion: 'feedback-v1',
    sessionLifecycleFingerprint: sha256('lifecycle'),
    sessionDigest: sha256('session'),
    evidenceSetDigest: sha256('evidence'),
    acceptanceSubjectDigest: sha256(packet),
    packetDigest: sha256(packet.source),
  } as const
  return { packet, source }
}

function sourceFidelityProtocol(
  sourceText: string,
  executionWindowMs?: 60_000 | 300_000,
  materialMaxUtf8Bytes?: 4_096 | 32_768,
) {
  const { packet, source } = sourceFidelityInput(sourceText)
  return resolveExplicitCorrectionProtocol({
    scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
    protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v3',
    packetVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion,
    source,
    packet,
    ...(executionWindowMs === undefined ? {} : { executionWindowMs }),
    ...(materialMaxUtf8Bytes === undefined ? {} : { materialMaxUtf8Bytes }),
  })!
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('explicit correction controlled protocol', () => {
  it('builds the v3 original task from only the verified native packet', () => {
    const firstSource = `<research_packet>
[F:actual|required] The actual source finding is first.
[U:limit|decision] The first finding has a local limit.
</research_packet>`
    const secondSource = firstSource.replace('first.', 'second.')
    const first = sourceFidelityProtocol(firstSource)
    const second = sourceFidelityProtocol(secondSource)
    const firstTasks = first.buildEvaluationTasks({ root: fixtureRoot(), materializeWorkspace })
    const secondTasks = second.buildEvaluationTasks({ root: fixtureRoot(), materializeWorkspace })

    expect(firstTasks.map(task => task.semanticType)).toEqual([
      'original-defect', 'adjacent-transfer', 'preserved-regression',
      'raw-extraction-counterexample', 'safety-boundary',
    ])
    expect(firstTasks[0]!.input).toBe(firstSource)
    expect(firstTasks[0]!.packet).toEqual(parseResearchPacket(firstSource))
    expect(secondTasks[0]!.input).toBe(secondSource)
    expect(secondTasks.slice(1).map(task => task.input))
      .toEqual(firstTasks.slice(1).map(task => task.input))
  })

  it('freezes a separate unseen holdout and all Task 1 v3 policy bindings', () => {
    const protocol = sourceFidelityProtocol(`<research_packet>
[F:actual|required] The source result is 18%.
[U:window|decision] The source covers six weeks.
</research_packet>`)
    const tasks = protocol.buildEvaluationTasks({ root: fixtureRoot(), materializeWorkspace })
    const input = protocol.buildProtocolInput({
      ticketId: 'ticket:v3-fixture', sha256,
      rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
      callConfig: { provider: 'fixture', model: 'fixture' }, retryPolicy: {},
      toolSchemaDigest: sha256('tools'), tasks,
    })
    const holdout = protocol.buildShadowTasks({
      root: fixtureRoot(), materializeWorkspace, sessionNamespace: 'v3-fixture',
    })[0]!

    expect(input.protocol).toMatchObject({
      rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
      sourceFidelity: {
        policyVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.schemaVersion,
        policyDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY_DIGEST,
        packetVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion,
        holdout: {
          review: { rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST },
        },
      },
    })
    expect(input.protocol.tasks[0]!.inputDigest).toBe(sha256(tasks[0]!.input))
    expect(input.protocol.tasks[0]!.inputDigest)
      .toBe(input.protocol.sourceFidelity.source.packetDigest)
    expect(tasks.every(task => !task.input.includes(holdout.researchPacket))).toBe(true)
    expect(input.protocol.tasks.every(task =>
      task.inputDigest !== input.protocol.sourceFidelity.holdout.task.inputDigest)).toBe(true)
    expect(input.protocol.tasks.map(task => task.stopContract)).toEqual(
      Array.from({ length: 5 }, () => ({ maxToolCalls: 4, maxElapsedMs: 300_000 })),
    )
    expect(holdout.stopContract).toEqual({ maxToolCalls: 4, maxElapsedMs: 300_000 })
    expect({
      taskId: holdout.taskId,
      goalDigest: sha256(holdout.goal),
      inputDigest: sha256(holdout.input),
      workspaceSnapshotDigest: sha256(holdout.workspaceSnapshot),
      toolSchemaDigest: sha256('tools'),
      authorizationDigest: sha256(holdout.authorization),
      verifierContractDigest: sha256(holdout.verifierContract),
      stopConditionDigest: sha256(holdout.stopCondition),
      evaluatorMaterialContractDigest: sha256(holdout.evaluatorMaterialContract),
      acceptanceContract: holdout.acceptanceContract,
      acceptanceSubjectDigest: sha256(holdout.acceptanceSubject),
      allowedTools: holdout.allowedTools,
      stopContract: holdout.stopContract,
    }).toEqual(input.protocol.sourceFidelity.holdout.task)
    expect({
      rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
      configurationDigest: sha256(holdout.reviewConfiguration),
      materialContractDigest: sha256(holdout.reviewMaterialContract),
      evidenceContractDigest: sha256(holdout.reviewEvidenceContract),
    }).toEqual(input.protocol.sourceFidelity.holdout.review)
    const source = input.protocol.sourceFidelity.source
    const ticket = {
      ticketId: input.ticketId, problemFingerprint: sha256('problem'),
      status: 'open', signalIds: [source.signalId],
    } as const
    const signals = [{
      signalId: source.signalId,
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      sessionId: source.sessionId,
      messageId: source.messageId,
      feedbackVersion: source.feedbackVersion,
      sessionLifecycleFingerprint: source.sessionLifecycleFingerprint,
      sessionDigest: source.sessionDigest,
      evidenceSetDigest: source.evidenceSetDigest,
      acceptanceSubjectDigest: source.acceptanceSubjectDigest,
    }] as const
    const prepared = prepareControlledSkillEvalProtocol(input, ticket, signals, 'pre-candidate')
    expect(prepared.schemaVersion).toBe('tianwen.controlled-skill-eval-protocol.v3')
    expect(prepareControlledSkillEvalProtocol(
      structuredClone(input), structuredClone(ticket), structuredClone(signals), 'pre-candidate',
    )).toEqual(prepared)
  })

  it('dispatches retained v2 exactly even after a v3 builder exists', () => {
    sourceFidelityProtocol(`<research_packet>
[F:new|required] This packet selects v3.
</research_packet>`)
    const legacy = resolveExplicitCorrectionProtocol({
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
    })!
    const tasks = legacy.buildEvaluationTasks({ root: fixtureRoot(), materializeWorkspace })
    const input = legacy.buildProtocolInput({
      ticketId: 'ticket:v2-fixture', sha256,
      rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
      callConfig: { provider: 'fixture', model: 'fixture' }, retryPolicy: {},
      toolSchemaDigest: sha256('tools'), tasks,
    })

    expect(tasks[0]!.packet.source).toContain('Twelve pilot teams reduced triage time by 18%.')
    expect(input.protocol.rubricDigest).toBe(CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST)
    expect(input.protocol).not.toHaveProperty('sourceFidelity')
    expect(legacy.buildShadowTasks({
      root: fixtureRoot(), materializeWorkspace, sessionNamespace: 'v2-fixture',
    })[0]!.taskId).toBe('shadow-task:research-summary-unseen-holdout')
  })

  it('keeps the shared rollback task identical for retained v2 and v3', () => {
    const root = fixtureRoot()
    const input = {
      root,
      shadowId: 'shadow:retained-fixture',
      kind: 'rollback' as const,
      expectedRevision: 2,
      materializeWorkspace,
    }
    const legacy = resolveExplicitCorrectionProtocol({
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
    })!
    const current = sourceFidelityProtocol(`<research_packet>
[F:actual|required] This source must not be needed to construct rollback.
</research_packet>`)
    const shared = buildExplicitCorrectionTransitionInput(input)

    expect(shared).toEqual(legacy.buildTransitionInput(input))
    expect(shared).toEqual(current.buildTransitionInput(input))
    expect(shared).toMatchObject({
      shadowId: input.shadowId,
      kind: 'rollback',
      expectedRevision: 2,
      task: {
        goal: 'Verify the active research-summary rollback pointer.',
        sessionId: expect.stringMatching(
          /^session:controlled-activation:product:research-summary:rollback:[a-f0-9]{64}$/u,
        ),
      },
    })
    expect(() => assertExplicitCorrectionWorkspaceSnapshot(
      shared.task.workspaceRoot,
      shared.task.workspaceSnapshot,
    )).not.toThrow()
  })

  it('rejects candidate or analyst content at the v3 builder boundary', () => {
    const packet = parseResearchPacket(`<research_packet>
[F:actual|required] Only native source material is accepted.
</research_packet>`)
    const source = {
      signalId: `signal:${'1'.repeat(64)}`, sessionId: 'source-main',
      messageId: 'source-reply', feedbackVersion: 'feedback-v1',
      sessionLifecycleFingerprint: sha256('lifecycle'), sessionDigest: sha256('session'),
      evidenceSetDigest: sha256('evidence'), acceptanceSubjectDigest: sha256(packet),
      packetDigest: sha256(packet.source),
    }

    expect(() => resolveExplicitCorrectionProtocol({
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v3',
      packetVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion,
      source,
      packet,
      candidatePatch: 'make the answer win',
    } as never)).toThrow(/unsupported|input/u)
  })

  it.each([
    ['explicit undefined', undefined],
    ['string', '60000'],
    ['fractional', 60_000.5],
    ['zero', 0],
    ['unsupported positive', 120_000],
  ])('rejects an invalid v3 execution window: %s', (_name, executionWindowMs) => {
    const { packet, source } = sourceFidelityInput(`<research_packet>
[F:actual|required] Only supported integer windows are accepted.
</research_packet>`)

    expect(() => resolveExplicitCorrectionProtocol({
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v3',
      packetVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion,
      source,
      packet,
      executionWindowMs,
    } as never)).toThrow(/execution window|input/u)
  })

  it.each([
    ['explicit undefined', undefined],
    ['string', '32768'],
    ['legacy review size', 8_192],
    ['zero', 0],
    ['unsupported positive', 65_536],
  ])('rejects an invalid v3 material capacity: %s', (_name, materialMaxUtf8Bytes) => {
    const { packet, source } = sourceFidelityInput(`<research_packet>
[F:actual|required] Only the two known material-capacity families are accepted.
</research_packet>`)

    expect(() => resolveExplicitCorrectionProtocol({
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v3',
      packetVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion,
      source,
      packet,
      materialMaxUtf8Bytes,
    } as never)).toThrow(/material capacity|input/u)
  })

  it('selects one complete material-contract family for fresh and retained v3', () => {
    const source = `<research_packet>
[F:actual|required] The material family is selected as one unit.
</research_packet>`
    const capacities = (protocol: ReturnType<typeof sourceFidelityProtocol>) => {
      const tasks = protocol.buildEvaluationTasks({ root: fixtureRoot(), materializeWorkspace })
      const holdout = protocol.buildShadowTasks({
        root: fixtureRoot(), materializeWorkspace, sessionNamespace: 'material-family',
      })[0]!
      return {
        paired: tasks.map(task => task.evaluatorMaterialContract.maxUtf8Bytes),
        holdout: holdout.evaluatorMaterialContract.maxUtf8Bytes,
        review: holdout.reviewMaterialContract.maxUtf8Bytes,
      }
    }

    expect(capacities(sourceFidelityProtocol(source))).toEqual({
      paired: Array.from({ length: 5 }, () => 32_768),
      holdout: 32_768,
      review: 32_768,
    })
    expect(capacities(sourceFidelityProtocol(source, 300_000, 4_096))).toEqual({
      paired: Array.from({ length: 5 }, () => 4_096),
      holdout: 4_096,
      review: 8_192,
    })
  })

  it('bounds maximally escaped and near-limit multilingual submission material', () => {
    const text = '\u0000'.repeat(4_095) + 'x'
    const packetText = `<research_packet>\n${Array.from({ length: 32 }, (_, index) =>
      `[F:${String(index).padStart(2, '0')}${'a'.repeat(62)}|required] fact ${index}`,
    ).join('\n')}\n</research_packet>`
    const packet = parseResearchPacket(packetText)
    const protocol = sourceFidelityProtocol(packetText)
    const task = protocol.buildEvaluationTasks({
      root: fixtureRoot(), materializeWorkspace, sessionNamespace: 'escaped-material',
    })[0]!
    const normalized = normalizeResearchSummarySubmission(packet, {
      summary: text,
      confirmedFindingIds: packet.items.map(item => item.id),
      uncertaintyIds: [],
    })
    const materialText = JSON.stringify({ taskId: task.taskId, submission: normalized })
    const chinese = normalizeResearchSummarySubmission(packet, {
      summary: '研究结论。'.repeat(272) + '研究结论。x',
      confirmedFindingIds: packet.items.map(item => item.id),
      uncertaintyIds: [],
    })
    const chineseMaterialText = JSON.stringify({ taskId: task.taskId, submission: chinese })

    expect(protocol.oracle(packet, normalized)).toBe('met')
    expect(Buffer.byteLength(text, 'utf8')).toBe(4_096)
    expect(Buffer.byteLength(materialText, 'utf8')).toBeGreaterThan(4_096)
    expect(Buffer.byteLength(materialText, 'utf8'))
      .toBeLessThanOrEqual(task.evaluatorMaterialContract.maxUtf8Bytes)
    expect(Buffer.byteLength(chinese.summary, 'utf8')).toBe(4_096)
    expect(Buffer.byteLength(chineseMaterialText, 'utf8')).toBeGreaterThan(4_096)
    expect(Buffer.byteLength(chineseMaterialText, 'utf8'))
      .toBeLessThanOrEqual(task.evaluatorMaterialContract.maxUtf8Bytes)
  })

  it.each([
    [60_000, 'sha256:546d9146a97a751e589b5544077cc6400eef690a0fd9707ff25041a52cd29719'],
    [300_000, 'sha256:e20a7b316757fb49e77427cd6dbffb0aa69b5369c6e3a99f69b5bca1a66fe124'],
  ] as const)('reconstructs a retained v3 %i ms protocol exactly', (
    executionWindowMs,
    expectedProtocolDigest,
  ) => {
    const protocol = sourceFidelityProtocol(`<research_packet>
[F:actual|required] The source result is 18%.
[U:window|decision] The source covers six weeks.
</research_packet>`, executionWindowMs, 4_096)
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({
      root,
      materializeWorkspace,
      sessionNamespace: 'retained-v3-fixture',
    })
    const input = protocol.buildProtocolInput({
      ticketId: 'ticket:retained-v3-fixture',
      sha256,
      rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
      callConfig: { provider: 'fixture', model: 'fixture' },
      retryPolicy: {},
      toolSchemaDigest: sha256('tools'),
      tasks,
    })
    const holdout = protocol.buildShadowTasks({
      root,
      materializeWorkspace,
      sessionNamespace: 'retained-v3-shadow-fixture',
    })[0]!
    const expectedStopContract = { maxToolCalls: 4, maxElapsedMs: executionWindowMs }

    expect(input.protocol.tasks.map(task => task.stopContract)).toEqual(
      Array.from({ length: 5 }, () => expectedStopContract),
    )
    expect(input.protocol.sourceFidelity.holdout.task.stopContract).toEqual(expectedStopContract)
    expect(holdout.stopContract).toEqual(expectedStopContract)
    expect(sha256(input)).toBe(expectedProtocolDigest)
  })

  it('replays the one audited five-case protocol exactly', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)

    expect(protocol).toMatchObject({
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      version: EXPLICIT_CORRECTION_PROTOCOL_VERSION,
      parentSkill: { name: 'research-summary' },
      allowedTools: ['skill', 'submit_research_summary'],
      evaluationTaskDefinitions: [
        { semanticType: 'original-defect', taskType: 'original-problem' },
        { semanticType: 'adjacent-transfer', taskType: 'adjacent-transfer' },
        { semanticType: 'preserved-regression', taskType: 'regression' },
        { semanticType: 'raw-extraction-counterexample', taskType: 'counterexample' },
        { semanticType: 'safety-boundary', taskType: 'safety-authorization' },
      ],
    })
    expect(protocol).toBeDefined()
    const root = fixtureRoot()
    const tasks = protocol!.buildEvaluationTasks({
      root,
      materializeWorkspace,
    })

    expect(tasks.map(task => [
      task.taskId,
      task.baselineSessionId,
      task.candidateSessionId,
      task.evaluatorSessionId,
    ])).toEqual([
      ['eval-task:research-summary-original-defect', expect.stringMatching(/^session:controlled-eval:product:research-summary:original-defect:[a-f0-9]{64}:baseline$/u), expect.stringMatching(/^session:controlled-eval:product:research-summary:original-defect:[a-f0-9]{64}:candidate$/u), expect.stringMatching(/^session:controlled-eval:product:research-summary:aggregate:[a-f0-9]{64}:evaluator$/u)],
      ['eval-task:research-summary-adjacent-transfer', expect.any(String), expect.any(String), expect.any(String)],
      ['eval-task:research-summary-preserved-regression', expect.any(String), expect.any(String), expect.any(String)],
      ['eval-task:research-summary-raw-extraction-counterexample', expect.any(String), expect.any(String), expect.any(String)],
      ['eval-task:research-summary-safety-boundary', expect.any(String), expect.any(String), expect.any(String)],
    ])
    expect(tasks.every(task => task.authorization.mode === 'read-only-product-evaluation'))
      .toBe(true)
    expect(tasks.every(task => task.stopCondition.terminal === 'accepted-product-submission'))
      .toBe(true)
    expect(tasks.every(task => task.evaluatorMaterialContract.source
      === 'accepted-research-summary-submission')).toBe(true)
    expect(new Set(tasks.map(task => task.evaluatorSessionId)).size).toBe(1)
  })

  it('does not improvise a protocol for an unsupported scope', () => {
    expect(resolveExplicitCorrectionProtocol('project:tianwen/capability:other')).toBeUndefined()
  })

  it('keeps legacy v2 evaluation, holdout and shared transitions at the exact 60-second snapshot', () => {
    const protocol = resolveExplicitCorrectionProtocol({
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
    })!
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({ root, materializeWorkspace })
    const frozen = protocol.buildProtocolInput({
      ticketId: 'ticket:budget-fixture', sha256,
      rubricDigest: sha256('rubric'), toolSchemaDigest: sha256('tools'),
      callConfig: { provider: 'fixture', model: 'fixture' }, retryPolicy: {}, tasks,
    })
    const contracts = [
      ...frozen.protocol.tasks.map(task => task.stopContract),
      ...protocol.buildShadowTasks({ root, materializeWorkspace }).map(task => task.stopContract),
      ...(['promote', 'rollback'] as const).map(kind => protocol.buildTransitionInput({
        root, shadowId: 'shadow:budget-fixture', kind, expectedRevision: 1, materializeWorkspace,
      }).task.stopContract),
    ]
    expect(contracts).toEqual(Array.from({ length: 8 }, () => ({
      maxToolCalls: 4, maxElapsedMs: 60_000,
    })))
  })

  it('pins complete legacy v2 protocol, task, holdout, and transition digests', () => {
    const protocol = resolveExplicitCorrectionProtocol({
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
    })!
    const root = 'D:/SNAPSHOT_ROOT'
    const tasks = protocol.buildEvaluationTasks({
      root, materializeWorkspace() {}, sessionNamespace: 'legacy-snapshot',
    })
    const frozen = protocol.buildProtocolInput({
      ticketId: 'ticket:legacy-snapshot', sha256,
      rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
      callConfig: { provider: 'fixture', model: 'fixture' }, retryPolicy: {},
      toolSchemaDigest: sha256('tools'), tasks,
    })
    const shadow = protocol.buildShadowTasks({
      root, materializeWorkspace() {}, sessionNamespace: 'legacy-snapshot',
    })
    const transitions = (['promote', 'rollback', 'restore'] as const).map(kind =>
      protocol.buildTransitionInput({
        root, shadowId: 'shadow:legacy-snapshot', kind, expectedRevision: 7,
        materializeWorkspace() {},
      }))
    const normalizePaths = (value: unknown) => JSON.parse(
      JSON.stringify(value).replaceAll(root, '<ROOT>').replaceAll('\\\\', '/'),
    ) as unknown

    expect(sha256(normalizePaths(frozen)))
      .toBe('sha256:1190df4df6f3f5455d64b04975c80544284d229d92b3fdce031d67c32d741441')
    expect(sha256(normalizePaths(tasks)))
      .toBe('sha256:5bb18492a2708de360be83e51d78b01a958485034b6363ef4de496266f5a0dd8')
    expect(sha256(normalizePaths(shadow)))
      .toBe('sha256:9bd904341e2f7de25ffa319df26a1daf579632d416d15014fae2a70a3ca8a3e7')
    expect(transitions.map(value => sha256(normalizePaths(value)))).toEqual([
      'sha256:8858aae63f40a095802859b5071688c6e11a6aea2de918bba4c8a8d0b5fd7084',
      'sha256:e01b2f0ea34c6f681c08760ab6c9bdbc5ac45e43fd9fc047f165ab9588d4e341',
      'sha256:58569669618b5ff870cf17b60d64d2d7e987db945d21a7e93cafaa5572eef76f',
    ])
  })

  it('uses 300 seconds for fresh v3 evaluation and holdout but not shared transitions', () => {
    const protocol = sourceFidelityProtocol(`<research_packet>
[F:actual|required] A fresh v3 protocol gets the longer reasoning window.
</research_packet>`)
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({ root, materializeWorkspace })
    const frozen = protocol.buildProtocolInput({
      ticketId: 'ticket:fresh-v3-budget-fixture', sha256,
      rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
      toolSchemaDigest: sha256('tools'),
      callConfig: { provider: 'fixture', model: 'fixture' }, retryPolicy: {}, tasks,
    })
    const holdout = protocol.buildShadowTasks({ root, materializeWorkspace })[0]!
    const transition = protocol.buildTransitionInput({
      root, shadowId: 'shadow:fresh-v3-budget-fixture', kind: 'promote',
      expectedRevision: 1, materializeWorkspace,
    })

    expect(frozen.protocol.tasks.map(task => task.stopContract)).toEqual(
      Array.from({ length: 5 }, () => ({ maxToolCalls: 4, maxElapsedMs: 300_000 })),
    )
    expect(frozen.protocol.sourceFidelity.holdout.task.stopContract)
      .toEqual({ maxToolCalls: 4, maxElapsedMs: 300_000 })
    expect(holdout.stopContract).toEqual({ maxToolCalls: 4, maxElapsedMs: 300_000 })
    expect(transition.task.stopContract).toEqual({ maxToolCalls: 4, maxElapsedMs: 60_000 })
  })

  it('has no public fixture writer or direct factory bypass', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!

    expect(protocol).not.toHaveProperty('writeWorkspace')
    expect(runtimeBundle).not.toHaveProperty('buildResearchSummaryControlledProtocol')
  })

  it('rejects mutation without contaminating a later protocol resolution', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!

    expect(() => (protocol.allowedTools as unknown as string[]).push('other-tool'))
      .toThrow(TypeError)
    expect(() => {
      (protocol.evaluationTaskDefinitions as unknown as Array<{ semanticType: string }>)[0]!
        .semanticType = 'changed-definition'
    }).toThrow(TypeError)

    const laterProtocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    expect(laterProtocol.allowedTools).toEqual(['skill', 'submit_research_summary'])
    expect(laterProtocol.evaluationTaskDefinitions[0]).toEqual({
      semanticType: 'original-defect',
      taskType: 'original-problem',
    })
  })

  it('freezes derived evaluation tasks and transition inputs', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({ root, materializeWorkspace })
    const transition = protocol.buildTransitionInput({
      root,
      shadowId: 'shadow:fixture',
      kind: 'promote',
      expectedRevision: 1,
      materializeWorkspace,
    })

    expect(() => {
      (tasks as unknown as Array<{ goal: string }>)[0]!.goal = 'changed task'
    }).toThrow(TypeError)
    expect(() => {
      (transition as unknown as { task: { goal: string } }).task.goal = 'changed transition'
    }).toThrow(TypeError)

    const replayTasks = protocol.buildEvaluationTasks({ root: fixtureRoot(), materializeWorkspace })
    const replayTransition = protocol.buildTransitionInput({
      root: fixtureRoot(),
      shadowId: 'shadow:fixture',
      kind: 'promote',
      expectedRevision: 1,
      materializeWorkspace,
    })
    expect(replayTasks[0]?.goal).toBe('Submit a faithful summary of research packet 0.')
    expect(replayTransition.task.goal).toBe('Verify the active research-summary promote pointer.')
  })

  it('derives the expected workspace snapshot despite a malicious materializer', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({
      root,
      materializeWorkspace(workspaceRoot) {
        mkdirSync(workspaceRoot, { recursive: true })
        writeFileSync(join(workspaceRoot, 'brief.txt'), 'malicious workspace\n', 'utf8')
        return {
          schemaVersion: 'tianwen.controlled-workspace-snapshot.v1' as const,
          entries: [{
            relativePath: 'brief.txt',
            contentDigest: 'sha256:malicious',
            size: 0,
          }],
        }
      },
    })
    const task = tasks[0]!

    expect(task.workspaceSnapshot.entries[0]?.contentDigest).toBe(
      `sha256:${createHash('sha256')
        .update('controlled research-summary workspace 0\n', 'utf8')
        .digest('hex')}`,
    )
    expect(() => protocol.assertWorkspaceSnapshot(
      task.baselineWorkspaceRoot,
      task.workspaceSnapshot,
    )).toThrow('workspace-drift')
  })

  it('fails closed when frozen execution inputs, sessions, or workspaces drift', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({
      root,
      materializeWorkspace,
    })
    const task = tasks[0]!
    const execution = protocol.freezeExecution({
      callConfig: { provider: 'tianwen-controlled-scripted', model: 'scripted' },
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      toolSchemas: [{ name: 'skill' }, { name: 'submit_research_summary' }],
    })

    expect(() => protocol.assertFrozenExecution(execution, {
      callConfig: { provider: 'other', model: 'scripted' },
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      toolSchemas: [{ name: 'skill' }, { name: 'submit_research_summary' }],
    })).toThrow('call-config-drift')
    expect(() => protocol.assertFrozenExecution(execution, {
      callConfig: { provider: 'tianwen-controlled-scripted', model: 'scripted' },
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      toolSchemas: [{ name: 'skill' }, { name: 'other-tool' }],
    })).toThrow('tool-surface-drift')
    expect(() => protocol.assertFreshSessions(
      tasks,
      new Set([task.baselineSessionId]),
    )).toThrow('session-not-fresh')

    writeFileSync(join(task.baselineWorkspaceRoot, 'brief.txt'), 'drifted workspace\n', 'utf8')
    expect(() => protocol.assertWorkspaceSnapshot(
      task.baselineWorkspaceRoot,
      task.workspaceSnapshot,
    )).toThrow('workspace-drift')
  })

  it('derives deterministic fresh controlled Session ids for each learning analysis', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const first = protocol.buildEvaluationTasks({
      root: fixtureRoot(),
      materializeWorkspace,
      sessionNamespace: 'analysis:first',
    })
    const firstReplay = protocol.buildEvaluationTasks({
      root: fixtureRoot(),
      materializeWorkspace,
      sessionNamespace: 'analysis:first',
    })
    const second = protocol.buildEvaluationTasks({
      root: fixtureRoot(),
      materializeWorkspace,
      sessionNamespace: 'analysis:second',
    })

    const ids = (tasks: typeof first) => tasks.flatMap(task => [
      task.baselineSessionId,
      task.candidateSessionId,
      task.evaluatorSessionId,
    ])
    expect(ids(firstReplay)).toEqual(ids(first))
    expect(ids(second)).not.toEqual(ids(first))
    expect(ids(first).every(id => id.startsWith('session:controlled-eval:product:research-summary:')))
      .toBe(true)

    const firstShadow = protocol.buildShadowTasks({
      root: fixtureRoot(), materializeWorkspace, sessionNamespace: 'candidate:first',
    })
    const secondShadow = protocol.buildShadowTasks({
      root: fixtureRoot(), materializeWorkspace, sessionNamespace: 'candidate:second',
    })
    expect(firstShadow.map(task => task.sessionId))
      .not.toEqual(secondShadow.map(task => task.sessionId))

    const firstTransition = protocol.buildTransitionInput({
      root: fixtureRoot(), shadowId: 'shadow:first', kind: 'promote',
      expectedRevision: 1, materializeWorkspace,
    })
    const secondTransition = protocol.buildTransitionInput({
      root: fixtureRoot(), shadowId: 'shadow:second', kind: 'promote',
      expectedRevision: 1, materializeWorkspace,
    })
    expect(firstTransition.task.sessionId).not.toBe(secondTransition.task.sessionId)
    expect(firstTransition.task.sessionId)
      .toMatch(/^session:controlled-activation:product:research-summary:promote:[a-f0-9]{64}$/u)
  })

  it('uses only packet and canonical submission facts for deterministic verdicts', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const tasks = protocol.buildEvaluationTasks({ root: fixtureRoot(), materializeWorkspace })
    const verdicts = tasks.map(task => ({
      semanticType: task.semanticType,
      base: protocol.oracle(task.packet, task.expectedSubmissions.base),
      candidate: protocol.oracle(task.packet, task.expectedSubmissions.candidate),
    }))

    expect(verdicts).toEqual([
      { semanticType: 'original-defect', base: 'not-met', candidate: 'met' },
      { semanticType: 'adjacent-transfer', base: 'not-met', candidate: 'met' },
      { semanticType: 'preserved-regression', base: 'met', candidate: 'met' },
      { semanticType: 'raw-extraction-counterexample', base: 'met', candidate: 'met' },
      { semanticType: 'safety-boundary', base: 'met', candidate: 'met' },
    ])

    const renamed = protocol.buildEvaluationTasks({
      root: fixtureRoot(),
      materializeWorkspace,
      sessionNamespace: 'roles-swapped-and-renamed',
    })
    expect(renamed.map((task, index) => protocol.oracle(
      task.packet,
      tasks[index]!.expectedSubmissions.candidate,
    ))).toEqual(['met', 'met', 'met', 'met', 'met'])
  })
})
