import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import {
  SessionId,
  SkillRegistry,
  applySkillTool,
  createUserMessage,
  defineTool,
  installModelSelection,
  mountPersistentHarness,
  textResponse,
  toolCallResponse,
  waitForIdle,
  type LlmCallConfig,
} from '@tianwen/dsh-compat'
import {
  CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
  sha256,
  type ResearchSummarySemanticReview,
} from '../../packages/tianwen-evolution/src/index.js'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import {
  RESEARCH_SUMMARY_QUALITY_TOOL_NAME,
  recoverResearchSummaryQualityReview,
  runResearchSummaryQualityReview,
} from '../../packages/tianwen-runtime/src/research-summary-quality.js'
import {
  RESEARCH_SUMMARY_SCOPE,
  RESEARCH_SUMMARY_TOOL_NAME,
  createResearchSummaryTool,
  parseResearchPacket,
  type ResearchPacket,
  type ResearchSummarySubmission,
} from '../../packages/tianwen-runtime/src/research-summary.js'

const roots: string[] = []
const packetText = `<research_packet>
[F:f1|required] The verified result is concrete.
[U:u1|decision] The deployment region is undecided.
</research_packet>`
const packet = parseResearchPacket(packetText)
const sourceConfig = {
  provider: 'tianwen-probe',
  model: 'scripted',
  temperature: 0.35,
  maxTokens: 777,
  stop: ['<review-stop>'],
} satisfies LlmCallConfig

function root(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-dsh-probe',
    'research-summary-quality',
  )
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(value)
  return value
}

function direct(text: string) {
  return createUserMessage({
    content: [{ type: 'text' as const, text }],
    source: { kind: 'user' as const },
  })
}

const highScores = {
  relevance: 4,
  correctnessReasoning: 4,
  clarityUsability: 3,
  scopeRestraint: 4,
  sourceFidelity: 3,
} as const

interface FixtureOptions {
  readonly packet?: ResearchPacket
  readonly sourceArguments?: ResearchSummarySubmission
  readonly submission?: ResearchSummarySubmission
  readonly scores?: typeof highScores
  readonly reviewerResponse?: Error | ReturnType<typeof toolCallResponse>
  readonly concurrent?: boolean
  readonly tamperRequest?: 'system' | 'config' | 'material' | 'schema'
  readonly cancelReview?: boolean
  readonly changeGlobalSelection?: boolean
}

async function runFixture(options: FixtureOptions = {}) {
  const directory = root('native')
  const boundPacket = options.packet ?? packet
  const submission: ResearchSummarySubmission = options.submission ?? {
    summary: 'The verified result is concrete. The deployment region is undecided.',
    confirmedFindingIds: ['f1'],
    uncertaintyIds: ['u1'],
  }
  const sourceArguments = options.sourceArguments ?? submission
  const reviewerResponse = options.reviewerResponse ?? toolCallResponse(
    'quality-grade',
    RESEARCH_SUMMARY_QUALITY_TOOL_NAME,
    { scores: options.scores ?? highScores },
  )
  const harness = await mountPersistentHarness(join(directory, 'sessions'), options.tamperRequest
    ? [
        toolCallResponse('source-submit', RESEARCH_SUMMARY_TOOL_NAME, sourceArguments),
        textResponse('The verified result is concrete.'),
      ]
    : [
        toolCallResponse('source-submit', RESEARCH_SUMMARY_TOOL_NAME, sourceArguments),
        reviewerResponse,
        textResponse('The verified result is concrete.'),
      ])
  await harness.ctx.plugin(SkillRegistry)
  await harness.ctx.plugin(applySkillTool)
  harness.ctx.skills.register({
    name: 'fixture-background-skill',
    description: 'Must stay outside the independent reviewer.',
    content: '# unrelated fixture skill',
    source: 'fixture',
  })
  harness.ctx.tools.register(defineTool({
    name: 'fixture_background_tool',
    description: 'Must stay outside the independent reviewer.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() { return 'unused' },
  }))
  await applyRuntime(harness.ctx, { evolutionRoot: join(directory, 'evolution') })
  const offTamper = options.tamperRequest
      ? harness.ctx.on('llm/stream', (request, next) => {
        if (String(request.sessionId).startsWith('session:research-summary-quality:')) {
          if (options.tamperRequest === 'system') {
            (request as { system: string }).system += '\nTampered after assembly.'
          } else if (options.tamperRequest === 'config') {
            (request as { temperature?: number }).temperature = 0.99
          } else if (options.tamperRequest === 'material') {
            (request as { messages: [] }).messages = []
          } else if (options.tamperRequest === 'schema') {
            const first = request.tools?.[0]
            if (first !== undefined) {
              (first as { description: string }).description += ' tampered'
            }
          }
        }
        return next()
      })
    : () => undefined

  let warm: ResearchSummarySemanticReview | undefined
  let lastInput: Parameters<typeof runResearchSummaryQualityReview>[1] | undefined
  let sourceSelection: Parameters<typeof installModelSelection>[1] | undefined
  const sourceTool = createResearchSummaryTool(boundPacket, { kind: 'source-capture' })
  const originalExecute = sourceTool.execute.bind(sourceTool)
  sourceTool.execute = async (args, execution) => {
    const result = await originalExecute(args, execution)
    const parentAgent = execution.agent!
    const run = harness.ctx.tianwenEvolution
      .getRunBindingBySessionId(String(parentAgent.session.id))!
    const callConfig = parentAgent.session.requestHeader()!.config
    const input = {
      parentAgent,
      run,
      packet: boundPacket,
      submission: result.submission,
      sourceCallId: String(execution.callId),
      sourceCallConfig: callConfig,
      signal: execution.signal,
    }
    lastInput = input
    if (options.changeGlobalSelection && sourceSelection !== undefined) {
      sourceSelection.current = {
        provider: 'tianwen-probe',
        model: 'changed-global-model',
      }
    }
    const reviews = options.concurrent
      ? await Promise.all([
          runResearchSummaryQualityReview(harness.ctx, input),
          runResearchSummaryQualityReview(harness.ctx, input),
        ])
      : [await runResearchSummaryQualityReview(harness.ctx, input)]
    expect(reviews.every(review => JSON.stringify(review) === JSON.stringify(reviews[0]))).toBe(true)
    warm = reviews[0]
    return result
  }

  const parent = await harness.ctx.agents.create({
    sessionId: SessionId(`research-quality-source-${randomUUID()}`),
    meta: { cwd: directory },
    agentOptions: {
      provider: sourceConfig.provider,
      model: sourceConfig.model,
      maxTokens: sourceConfig.maxTokens,
    },
    setup(agentCtx) {
      sourceSelection = {
        current: { provider: sourceConfig.provider, model: sourceConfig.model },
        assembled: undefined,
      }
      installModelSelection(agentCtx, sourceSelection)
      agentCtx.tools.register(sourceTool)
      agentCtx.on('agent/request', async (_payload, next) => ({
        ...await next(),
        temperature: sourceConfig.temperature,
        stop: [...sourceConfig.stop],
      }))
    },
  })
  const binding = harness.ctx.tianwenLearningIntake.bindRun(parent.agent.session, {
    goalRef: 'goal:research-summary-quality-fixture',
    taskRef: 'task:research-summary-quality-fixture',
    scopeKey: RESEARCH_SUMMARY_SCOPE,
    acceptanceContract: {
      source: 'dsh-tool-result',
      toolName: RESEARCH_SUMMARY_TOOL_NAME,
      notMetErrorCode: 'RESEARCH_SUMMARY_NOT_MET',
      gapDisposition: 'reusable',
      problemCategory: 'research-summary-result.v2:fixture',
      severity: 2,
      blocksGoal: false,
      qualityContract: {
        schemaVersion: 'tianwen.research-summary-semantic-contract.v1',
        rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
      },
    },
    acceptanceSubjectDigest: sha256(boundPacket),
  } as never)
  expect(harness.ctx.tianwenEvolution.getRunBinding(binding.runId)).toMatchObject({
    schemaVersion: 'tianwen.run-binding.v3',
    acceptanceSubjectDigest: sha256(boundPacket),
    acceptanceContract: {
      qualityContract: {
        schemaVersion: 'tianwen.research-summary-semantic-contract.v1',
        rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
      },
    },
  })

  const offCancel = options.cancelReview
    ? harness.ctx.on('llm/stream', (request, next) => {
        if (String(request.sessionId).startsWith('session:research-summary-quality:')) {
          parent.agent.cancel({ kind: 'hook', reason: 'fixture-review-cancel' })
        }
        return next()
      }, { prepend: true })
    : () => undefined

  parent.agent.followup(direct('Summarize the frozen packet.'))
  await waitForIdle(harness.ctx, parent.agent)
  await harness.ctx.sessions.flush(parent.agent.session)
  const run = harness.ctx.tianwenEvolution.getRunBinding(binding.runId)!
  const recovered = await recoverResearchSummaryQualityReview(harness.ctx, {
    parentAgent: parent.agent,
    run,
    packet: boundPacket,
    submission,
    expectedReview: warm,
    signal: new AbortController().signal,
  })
  offCancel()
  offTamper()
  return {
    directory, harness, parent, run, packet: boundPacket, sourceArguments,
    submission, warm: warm!, recovered, input: lastInput!,
  }
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true })
})

describe('native research-summary quality review', () => {
  it('reviews and recovers canonical content while preserving raw source arguments', async () => {
    const boundPacket = parseResearchPacket(`<research_packet>
[F:f1|required] Required finding one.
[F:f2|optional] Optional finding two.
[U:u1|decision] Decision uncertainty one.
[U:u2|decision] Decision uncertainty two.
</research_packet>`)
    const sourceArguments = {
      summary: '  Required finding one.\r\nDecision uncertainty one.  ',
      confirmedFindingIds: ['f2', 'f1'],
      uncertaintyIds: ['u2', 'u1'],
    }
    const submission = {
      summary: 'Required finding one.\nDecision uncertainty one.',
      confirmedFindingIds: ['f1', 'f2'],
      uncertaintyIds: ['u1', 'u2'],
    }
    const fixture = await runFixture({ packet: boundPacket, sourceArguments, submission })
    try {
      expect(fixture.warm).toMatchObject({ status: 'completed' })
      expect(fixture.recovered).toEqual(fixture.warm)
      expect(fixture.recovered).toMatchObject({
        status: 'completed',
        submissionDigest: sha256(submission),
      })
      const sourceEvidence = fixture.harness.ctx.tianwenEvidence
        .project(fixture.parent.agent.session)
        .find(item => item.action.toolName === RESEARCH_SUMMARY_TOOL_NAME)!
      expect(sourceEvidence.action.argumentsDigest).toBe(sha256(sourceArguments))
      expect(sourceEvidence.action.argumentsDigest).not.toBe(sha256(submission))
    } finally {
      await fixture.parent.dispose()
      await fixture.harness.ctx.fiber.dispose()
    }
  })

  it('uses one deterministic native child and recovers its exact completed proof without a model call', async () => {
    const fixture = await runFixture({ concurrent: true, changeGlobalSelection: true })
    try {
      expect(fixture.warm).toEqual(fixture.recovered)
      expect(fixture.recovered).toMatchObject({
        status: 'completed',
        idGateVerdict: 'met',
        scores: highScores,
      })
      expect(fixture.harness.adapter.requests).toHaveLength(3)
      const reviewRequest = fixture.harness.adapter.requests[1]!
      expect({
        provider: reviewRequest.provider,
        model: reviewRequest.model,
        temperature: reviewRequest.temperature,
        maxTokens: reviewRequest.maxTokens,
        stop: reviewRequest.stop,
      }).toEqual(sourceConfig)
      expect(reviewRequest.tools?.map(tool => tool.name)).toEqual([
        RESEARCH_SUMMARY_QUALITY_TOOL_NAME,
      ])
      expect(reviewRequest.messages).toHaveLength(1)
      expect(JSON.stringify(reviewRequest)).not.toContain('fixture-background')

      const before = fixture.harness.adapter.requests.length
      await expect(recoverResearchSummaryQualityReview(fixture.harness.ctx, {
        parentAgent: fixture.parent.agent,
        run: fixture.run,
        packet,
        submission: fixture.submission,
        expectedReview: fixture.recovered,
        signal: new AbortController().signal,
      })).resolves.toEqual(fixture.recovered)
      expect(fixture.harness.adapter.requests).toHaveLength(before)

      const sourceResult = fixture.parent.agent.session.events.find(event =>
        event.type === 'tool/result'
        && event.data.message.content[0].toolCallId === 'source-submit')
      expect(JSON.stringify(sourceResult)).toContain('not-evaluated')
      expect(JSON.stringify(sourceResult)).not.toContain('sourceFidelity')
    } finally {
      await fixture.parent.dispose()
      await fixture.harness.ctx.fiber.dispose()
    }
  })

  it('returns a completed low semantic score instead of fitting the answer or fabricating infrastructure failure', async () => {
    const scores = { ...highScores, sourceFidelity: 2 } as const
    const fixture = await runFixture({ scores })
    try {
      expect(fixture.recovered).toMatchObject({
        status: 'completed',
        idGateVerdict: 'met',
        scores,
      })
      expect(fixture.harness.adapter.requests).toHaveLength(3)
    } finally {
      await fixture.parent.dispose()
      await fixture.harness.ctx.fiber.dispose()
    }
  })

  it('keeps provider and invalid-grade failures explicitly inconclusive', async () => {
    for (const reviewerResponse of [
      new Error('fixture provider unavailable'),
      toolCallResponse('invalid-grade', RESEARCH_SUMMARY_QUALITY_TOOL_NAME, {
        scores: { ...highScores, sourceFidelity: 5 },
      }),
    ]) {
      const fixture = await runFixture({ reviewerResponse })
      try {
        expect(fixture.recovered.status).toBe('inconclusive')
        const before = fixture.harness.adapter.requests.length
        await expect(runResearchSummaryQualityReview(fixture.harness.ctx, {
          ...fixture.input,
          signal: new AbortController().signal,
        })).resolves.toMatchObject({ status: 'inconclusive' })
        expect(fixture.harness.adapter.requests).toHaveLength(before)
      } finally {
        await fixture.parent.dispose()
        await fixture.harness.ctx.fiber.dispose()
      }
    }
  })

  it.each(['system', 'config', 'material', 'schema'] as const)(
    'rejects %s changed after assembly and never reaches the provider for that review', async tamper => {
      const fixture = await runFixture({ tamperRequest: tamper })
      try {
        expect(fixture.recovered.status).toBe('inconclusive')
        expect(fixture.harness.adapter.requests.every(request =>
          !String(request.sessionId).startsWith('session:research-summary-quality:'))).toBe(true)
      } finally {
        await fixture.parent.dispose()
        await fixture.harness.ctx.fiber.dispose()
      }
    },
  )

  it('treats cancellation and a mismatched expected proof as inconclusive without recreating history', async () => {
    const cancelled = await runFixture({ cancelReview: true })
    try {
      expect(cancelled.recovered.status).toBe('inconclusive')
      const before = cancelled.harness.adapter.requests.length
      await expect(runResearchSummaryQualityReview(cancelled.harness.ctx, {
        ...cancelled.input,
        signal: new AbortController().signal,
      })).resolves.toMatchObject({ status: 'inconclusive' })
      expect(cancelled.harness.adapter.requests).toHaveLength(before)
    } finally {
      await cancelled.parent.dispose()
      await cancelled.harness.ctx.fiber.dispose()
    }

    const completed = await runFixture()
    try {
      const forged = completed.recovered.status === 'completed'
        ? { ...completed.recovered, requestDigest: sha256('forged-request') }
        : completed.recovered
      const before = completed.harness.adapter.requests.length
      await expect(recoverResearchSummaryQualityReview(completed.harness.ctx, {
        parentAgent: completed.parent.agent,
        run: completed.run,
        packet,
        submission: completed.submission,
        expectedReview: forged,
        signal: new AbortController().signal,
      })).resolves.toMatchObject({ status: 'inconclusive', reasonCode: 'review-invalid' })
      expect(completed.harness.adapter.requests).toHaveLength(before)
    } finally {
      await completed.parent.dispose()
      await completed.harness.ctx.fiber.dispose()
    }
  })
})
