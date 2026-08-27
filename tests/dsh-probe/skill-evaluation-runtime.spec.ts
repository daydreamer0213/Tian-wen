import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  DynamicCordisRunnerService,
  LlmAdapter,
  SessionId,
  SkillRegistry,
  applySkillTool,
  createUserMessage,
  defineTool,
  mountCoreHarness,
  renderSkillContent,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import type { GenerateOptions, LlmCallConfig, StreamChunk } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import {
  apply,
  compareNormalizedSkillEvaluationRequests,
  normalizeSkillEvaluationRequest,
  observeSkillEvaluationRequest,
} from '../../packages/tianwen-runtime/src/index.js'

const config: LlmCallConfig = {
  provider: 'tianwen-stage4-scripted',
  model: 'scripted',
  maxTokens: 256,
}

function stage4FixtureBaseRoot(
  platform: NodeJS.Platform,
  configuredRoot: string | undefined,
  temporaryRoot: string,
) {
  return configuredRoot ?? (platform === 'win32'
    ? 'D:\\DevData\\tianwen-stage4-test-fixtures'
    : posix.join(temporaryRoot, 'tianwen-stage4-test-fixtures'))
}

function stage4FixtureRoot(name: string) {
  return join(stage4FixtureBaseRoot(
    process.platform,
    process.env.TIANWEN_DSH_PROBE_ROOT,
    tmpdir(),
  ), name)
}

const request = {
  ...config,
  sessionId: 'session:paired-arm',
  messages: [{
    id: 'message:skill',
    role: 'user',
    content: [{ type: 'text', text: '<skill_content>selected</skill_content>' }],
    source: { kind: 'user' },
  }],
} as unknown as GenerateOptions

const parent = {
  name: 'research-summary',
  description: 'Summarize one research observation',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Research summary\n\nState the observed result before interpretation.',
} as const

const candidate = {
  ...parent,
  content: '# Research summary\n\nState the observed result with an explicit confidence level.',
} as const

const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

function digest(value: string) {
  return sha256(value)
}

function protocolInputs() {
  return [
    ['eval-case:problem', 'problem'],
    ['eval-case:regression', 'regression'],
    ['eval-case:counterexample', 'counterexample'],
    ['eval-case:safety', 'safety'],
  ] as const
}

function evaluationBudget() {
  return {
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
  }
}

function scopedSurface(harness: Awaited<ReturnType<typeof mountCoreHarness>>) {
  const schemas = harness.ctx.tools.schemas().toSorted((left, right) =>
    left.name.localeCompare(right.name))
  return {
    toolSchemaDigest: sha256(schemas),
  }
}

function evaluationEnvironment(
  harness: Awaited<ReturnType<typeof mountCoreHarness>>,
  budget = evaluationBudget(),
) {
  return {
    dshVersion: '0.1.1-rc.2' as const,
    providerId: config.provider,
    modelId: config.model,
    callConfigDigest: sha256(config),
    ...scopedSurface(harness),
    workspaceSnapshotDigest: digest('workspace'),
    validatorContractDigest: digest('validator'),
    policyAuthorization: 'unobservable' as const,
    workspaceBinding: 'unbound' as const,
    validatorBinding: 'unbound' as const,
    dataBinding: 'unbound' as const,
    budget,
  }
}

function seedCandidate(
  harness: Awaited<ReturnType<typeof mountCoreHarness>>,
  budget = evaluationBudget(),
) {
  const evolution = harness.ctx.tianwenEvolution
  const prior = [
    ['first', 'not-met', 'a'],
    ['second', 'not-met', 'b'],
    ['counterexample', 'met', 'c'],
  ] as const
  const records = prior.map(([suffix, verdict, evidence]) => {
    const binding = evolution.recordRunBinding({
      goalRef: 'goal:research-preview',
      taskRef: `task:seed-${suffix}`,
      sessionId: `session:seed-${suffix}`,
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract: acceptance,
    })
    const manifest = evolution.recordRunSkillManifest({ runId: binding.runId, skill: parent })
    const sessionDigest = digest(`session:${suffix}`)
    const evidenceId = digest(`evidence:${evidence}`)
    const outcome = evolution.recordOutcomeIntake({
      runId: binding.runId,
      verdict,
      sessionDigest,
      evidenceIds: [evidenceId],
    })
    evolution.recordRunSkillUse({
      runId: binding.runId,
      parentVersionId: manifest.parentVersionId,
      sessionId: `session:seed-${suffix}`,
      sessionDigest,
      skillName: parent.name,
      contentDigest: digest(parent.content),
      skillEvidenceId: digest(`skill:${evidence}`),
      acceptanceEvidenceId: evidenceId,
      skillCallSeq: 10,
      skillResultSeq: 11,
      acceptanceCallSeq: 12,
    })
    return { binding, manifest, outcome, evidenceId }
  })
  const ticketId = records[1]!.outcome.ticketId!
  const cases = protocolInputs().map(([caseId, category], index) => ({
    caseId,
    category,
    inputDigest: digest(`/research-summary\n${category}`),
    dataSnapshotDigest: digest(`data:${category}`),
    acceptanceContract: acceptance,
  }))
  const protocol = evolution.freezeSkillEvalProtocol({
    ticketId,
    protocol: {
      cases,
      armOrder: 'baseline-then-candidate',
      repetition: { attempts: 1, reducer: 'all-attempts-must-pass' },
      hardGates: ['problem', 'regression', 'counterexample', 'safety'],
      softMetrics: ['model-requests', 'tool-calls'],
      thresholds: { requiredCasePasses: 4 },
      budget,
      execution: {
        providerId: config.provider,
        modelId: config.model,
        ...scopedSurface(harness),
        validatorContractDigest: digest('validator'),
      },
    },
  })
  const opened = evolution.openLearningCase({
    ticketId,
    counterevidenceRunIds: [records[2]!.binding.runId],
  })
  const learningCase = evolution.getLearningCase(opened.caseId)!
  const attribution = evolution.recordAttribution({
    caseId: learningCase.caseId,
    resolution: 'dsh-skill',
    targetSkillName: parent.name,
    hypothesis: 'The parent instruction omits confidence reporting.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    alternatives: 'Tool and Runtime causes remain unsupported.',
  })
  const lesson = evolution.recordAcceptedLesson({
    caseId: learningCase.caseId,
    attributionId: attribution.attributionId,
    claim: 'State confidence after the observed result.',
    when: 'When summarizing a verified research observation.',
    notWhen: 'When the task requests raw extraction.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    targetScope: learningCase.scopeKey,
  })
  const candidateReceipt = evolution.recordSkillCandidate({
    lessonId: lesson.lessonId,
    payload: {
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      source: candidate.source,
      content: candidate.content,
    },
    evidenceIds: [
      ...learningCase.supportingEvidenceIds,
      ...learningCase.counterevidence.flatMap(item => item.evidenceIds),
    ],
  })
  return {
    candidateId: candidateReceipt.candidateId,
    protocolId: protocol.protocolId,
    environment: evaluationEnvironment(harness, budget),
  }
}

function evaluationInput(
  seeded: ReturnType<typeof seedCandidate>,
  scriptedFixture: readonly (readonly StreamChunk[] | Error)[] = [],
) {
  return {
    candidateId: seeded.candidateId,
    protocolId: seeded.protocolId,
    environment: seeded.environment,
    callConfig: config,
    cases: protocolInputs().map(([caseId, category]) => ({
      caseId,
      input: `/research-summary\n${category}`,
    })),
    scriptedFixture,
  }
}

class RouteCollisionAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield* textResponse('must not dispatch')
  }
}

function requestConfig(value: GenerateOptions): LlmCallConfig {
  return {
    provider: value.provider,
    model: value.model,
    ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }),
    ...(value.temperature === undefined ? {} : { temperature: value.temperature }),
    ...(value.maxTokens === undefined ? {} : { maxTokens: value.maxTokens }),
    ...(value.stop === undefined ? {} : { stop: value.stop }),
  }
}

describe('paired Skill evaluation request observation', () => {
  it('selects a configured or platform-absolute fixture root', () => {
    const windowsRoot = stage4FixtureBaseRoot('win32', undefined, 'C:\\Temp')
    const posixRoot = stage4FixtureBaseRoot('linux', undefined, '/tmp')
    expect(windowsRoot).toBe('D:\\DevData\\tianwen-stage4-test-fixtures')
    expect(win32.isAbsolute(windowsRoot)).toBe(true)
    expect(posixRoot).toBe('/tmp/tianwen-stage4-test-fixtures')
    expect(posix.isAbsolute(posixRoot)).toBe(true)
    expect(stage4FixtureBaseRoot('linux', '/configured-fixture-root', '/tmp'))
      .toBe('/configured-fixture-root')
  })

  it('installs the isolated paired Skill evaluation coordinator with the normal runtime', async () => {
    const root = stage4FixtureRoot('runtime-red')
    const harness = await mountCoreHarness([textResponse('unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() { return 'accepted' },
    }))
    try {
      await apply(harness.ctx, { evolutionRoot: root })
      expect((harness.ctx as unknown as {
        tianwenSkillEvaluation?: unknown
      }).tianwenSkillEvaluation).toBeDefined()
    } finally {
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('durably prepares the fixed B/C matrix before eight normal DSH Agent turns', async () => {
    const root = stage4FixtureRoot('runtime-matrix')
    const script = Array.from({ length: 8 }, (_, index) => [
      toolCallResponse(`verify-${index}`, 'verify_summary', { text: `case ${index}` }),
      textResponse(`scripted answer ${index}`),
    ]).flat()
    const harness = await mountCoreHarness([textResponse('host route remains unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() { return 'accepted' },
    }))
    const disposeParent = harness.ctx.skills.register(parent)
    try {
      await apply(harness.ctx, { evolutionRoot: root })
      const seeded = seedCandidate(harness)
      const receipt = await harness.ctx.tianwenSkillEvaluation.run(evaluationInput(seeded, script))
      expect(receipt.plan.cases).toHaveLength(4)
      expect(receipt.result).toMatchObject({
        evidenceClass: 'scripted-mechanism',
        verdict: 'INCONCLUSIVE',
        comparison: 'not-comparable',
        decision: 'needs-evidence',
      })
      expect(receipt.result.reasonCodes).toContain('scripted-model-output')
      expect(receipt.result.cases).toEqual(expect.arrayContaining([
        expect.objectContaining({
          baseline: expect.objectContaining({ outcome: 'met' }),
          candidate: expect.objectContaining({ outcome: 'met' }),
        }),
      ]))
      expect(receipt.result.cases.every(item =>
        item.baseline.normalizedFirstRequestDigest === item.candidate.normalizedFirstRequestDigest))
        .toBe(true)
      expect(harness.adapter.requests).toHaveLength(0)
      expect(harness.ctx.tianwenEvolution.listSkillEvaluations()).toHaveLength(1)
      expect(harness.ctx.tianwenEvolution.getSkillCandidate(seeded.candidateId))
        .toMatchObject({ status: 'recorded' })
      const replay = await harness.ctx.tianwenSkillEvaluation.run(evaluationInput(seeded, script))
      expect(replay.result).toEqual(receipt.result)
      expect(harness.adapter.requests).toHaveLength(0)
      await expect(harness.ctx.tianwenSkillEvaluation.run({
        ...evaluationInput(seeded, script),
        callConfig: { ...config, maxTokens: 128 },
      })).rejects.toThrow('call config disagrees with its protocol')
      expect(harness.adapter.requests).toHaveLength(0)
      expect(await harness.ctx.skills.get(parent.name)).toMatchObject({ content: parent.content })
      expect(JSON.stringify(harness.ctx.tianwenEvolution.listEvents()))
        .not.toContain('skill-evaluation-opened')
    } finally {
      disposeParent()
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a changed actual visible tool surface before opening a plan', async () => {
    const root = stage4FixtureRoot('runtime-surface-mismatch')
    const harness = await mountCoreHarness([textResponse('unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'accepted' },
    }))
    const disposeParent = harness.ctx.skills.register(parent)
    try {
      await apply(harness.ctx, { evolutionRoot: root })
      const seeded = seedCandidate(harness)
      harness.ctx.tools.register(defineTool({
        name: 'drifted_tool',
        description: 'a tool added after the protocol was frozen',
        parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        async execute() { return 'drifted' },
      }))
      await expect(harness.ctx.tianwenSkillEvaluation.run(evaluationInput(seeded)))
        .rejects.toThrow('actual visible tool surface disagrees with its protocol')
      expect(harness.ctx.tianwenEvolution.listSkillEvaluations()).toHaveLength(0)
      expect(harness.adapter.requests).toHaveLength(0)
    } finally {
      disposeParent()
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a non-scripted provider before creating an Agent or dispatching a request', async () => {
    const root = stage4FixtureRoot('runtime-non-scripted-preflight')
    const harness = await mountCoreHarness([textResponse('unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'accepted' },
    }))
    const disposeParent = harness.ctx.skills.register(parent)
    const create = vi.spyOn(harness.ctx.agents, 'create')
    try {
      await apply(harness.ctx, { evolutionRoot: root })
      const seeded = seedCandidate(harness)
      await expect(harness.ctx.tianwenSkillEvaluation.run({
        ...evaluationInput(seeded),
        callConfig: { ...config, provider: 'untrusted-provider' },
      })).rejects.toThrow('zero-cost scripted mechanism')
      expect(create).not.toHaveBeenCalled()
      expect(harness.adapter.requests).toHaveLength(0)
      expect(harness.ctx.tianwenEvolution.listSkillEvaluations()).toHaveLength(0)
    } finally {
      create.mockRestore()
      disposeParent()
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects an arbitrary adapter occupying the reserved Stage 4 route before an Agent or request', async () => {
    const root = stage4FixtureRoot('runtime-scripted-route-collision')
    const script = Array.from({ length: 8 }, (_, index) => [
      toolCallResponse(`verify-${index}`, 'verify_summary', { text: `case ${index}` }),
      textResponse(`scripted answer ${index}`),
    ]).flat()
    const harness = await mountCoreHarness([textResponse('host route remains unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'accepted' },
    }))
    const disposeParent = harness.ctx.skills.register(parent)
    const collision = new RouteCollisionAdapter()
    const releaseCollision = harness.ctx.llm.registerAdapter(['tianwen-stage4-scripted'], collision)
    const create = vi.spyOn(harness.ctx.agents, 'create')
    try {
      await apply(harness.ctx, { evolutionRoot: root })
      const seeded = seedCandidate(harness)
      await expect(harness.ctx.tianwenSkillEvaluation.run(evaluationInput(seeded, script)))
        .rejects.toThrow('already registered')
      expect(create).not.toHaveBeenCalled()
      expect(collision.requests).toHaveLength(0)
      expect(harness.adapter.requests).toHaveLength(0)
      expect(harness.ctx.tianwenEvolution.listSkillEvaluations()).toHaveLength(0)
    } finally {
      create.mockRestore()
      releaseCollision()
      disposeParent()
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects an intruder Session without consuming the first paired fixture entry', async () => {
    const root = stage4FixtureRoot('runtime-scripted-route-intruder')
    const script = Array.from({ length: 8 }, (_, index) => [
      toolCallResponse(`verify-${index}`, 'verify_summary', { text: `case ${index}` }),
      textResponse(`scripted answer ${index}`),
    ]).flat()
    const harness = await mountCoreHarness([textResponse('host route remains unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'accepted' },
    }))
    const disposeParent = harness.ctx.skills.register(parent)
    let attempted = false
    const intruderChunks: StreamChunk[] = []
    const observedSessionIds: string[] = []
    try {
      await apply(harness.ctx, { evolutionRoot: root })
      harness.ctx.on('llm/stream', (streamRequest, next) => {
        observedSessionIds.push(String(streamRequest.sessionId))
        if (attempted || !String(streamRequest.sessionId).startsWith('session:skill-eval:')) return next()
        attempted = true
        return (async function* () {
          for await (const _chunk of harness.ctx.llm.stream({
            ...config,
            sessionId: SessionId('session:stage4-intruder'),
            messages: [createUserMessage({
              content: [{ type: 'text', text: 'intrude on the reserved evaluation route' }],
              source: { kind: 'user' },
            })],
          })) intruderChunks.push(_chunk)
          yield* next()
        })()
      })
      const seeded = seedCandidate(harness)
      const receipt = await harness.ctx.tianwenSkillEvaluation.run(evaluationInput(seeded, script))
      expect(attempted).toBe(true)
      expect(observedSessionIds).toContain('session:stage4-intruder')
      expect(intruderChunks).toEqual([
        expect.objectContaining({
          type: 'finish',
          reason: expect.objectContaining({ kind: 'error' }),
        }),
      ])
      expect(receipt.result.cases[0]!.baseline).toMatchObject({
        outcome: 'met',
        usage: { modelRequests: 2, toolCalls: 1 },
      })
      expect(JSON.stringify(receipt.result)).not.toContain('session:stage4-intruder')
      expect(harness.ctx.tianwenEvolution.getSkillEvaluationResult(receipt.evaluationId))
        .toEqual(receipt.result)
    } finally {
      disposeParent()
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('records budget exhaustion as inconclusive while the stream observer continues exactly once', async () => {
    const root = stage4FixtureRoot('runtime-budget-exhaustion')
    const script = Array.from({ length: 8 }, (_, index) => [
      toolCallResponse(`verify-${index}`, 'verify_summary', { text: `case ${index}` }),
      textResponse(`scripted answer ${index}`),
    ]).flat()
    const harness = await mountCoreHarness([textResponse('host route remains unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'accepted' },
    }))
    const disposeParent = harness.ctx.skills.register(parent)
    try {
      await apply(harness.ctx, { evolutionRoot: root })
      const downstreamRequests: GenerateOptions[] = []
      harness.ctx.on('llm/stream', (streamRequest, next) => {
        downstreamRequests.push(streamRequest)
        return next()
      })
      const seeded = seedCandidate(harness, {
        ...evaluationBudget(),
        maxModelRequestsPerArm: 1,
        maxToolCallsPerArm: 0,
        maxTotalModelRequests: 8,
        maxTotalToolCalls: 0,
      })
      const receipt = await harness.ctx.tianwenSkillEvaluation.run(evaluationInput(seeded, script))
      expect(receipt.result).toMatchObject({ verdict: 'INCONCLUSIVE', comparison: 'not-comparable' })
      for (const item of receipt.result.cases) {
        expect(item.baseline).toMatchObject({
          outcome: 'inconclusive',
          reasonCode: 'arm-budget-exhausted',
          usage: { modelRequests: 2, toolCalls: 1 },
        })
        expect(item.candidate).toMatchObject({
          outcome: 'inconclusive',
          reasonCode: 'arm-budget-exhausted',
          usage: { modelRequests: 2, toolCalls: 1 },
        })
      }
      expect(harness.adapter.requests).toHaveLength(0)
      expect(downstreamRequests).toHaveLength(16)
    } finally {
      disposeParent()
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('retains dispatched scripted usage when outcome intake fails after a Turn', async () => {
    const root = stage4FixtureRoot('runtime-failed-usage')
    const script = Array.from({ length: 8 }, (_, index) => [
      toolCallResponse(`verify-${index}`, 'verify_summary', { text: `case ${index}` }),
      textResponse(`scripted answer ${index}`),
    ]).flat()
    const harness = await mountCoreHarness([textResponse('host route remains unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'accepted' },
    }))
    const disposeParent = harness.ctx.skills.register(parent)
    try {
      await apply(harness.ctx, { evolutionRoot: root })
      const seeded = seedCandidate(harness)
      const consume = vi.spyOn(harness.ctx.tianwenLearningIntake, 'consumeOutcome')
        .mockImplementationOnce(() => {
          throw new Error('synthetic post-turn intake failure')
        })
      const receipt = await harness.ctx.tianwenSkillEvaluation.run(evaluationInput(seeded, script))
      expect(receipt.result.cases[0]!.baseline).toMatchObject({
        outcome: 'inconclusive',
        usage: { modelRequests: 2, toolCalls: 1, tokens: 0, cnyMilli: 0 },
      })
      expect(harness.adapter.requests).toHaveLength(0)
      consume.mockRestore()
    } finally {
      disposeParent()
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('durably records inconclusive arms when Evidence projection itself fails', async () => {
    const root = stage4FixtureRoot('runtime-evidence-projection-failure')
    const script = Array.from({ length: 8 }, (_, index) => [
      toolCallResponse(`verify-${index}`, 'verify_summary', { text: `case ${index}` }),
      textResponse(`scripted answer ${index}`),
    ]).flat()
    const harness = await mountCoreHarness([textResponse('host route remains unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'accepted' },
    }))
    const disposeParent = harness.ctx.skills.register(parent)
    await apply(harness.ctx, { evolutionRoot: root })
    const project = vi.spyOn(harness.ctx.tianwenEvidence, 'project').mockImplementation(() => {
      throw new Error('synthetic Evidence projection failure')
    })
    try {
      const seeded = seedCandidate(harness)
      const receipt = await harness.ctx.tianwenSkillEvaluation.run(evaluationInput(seeded, script))
      expect(receipt.result).toMatchObject({ verdict: 'INCONCLUSIVE', comparison: 'not-comparable' })
      expect(receipt.result.cases[0]!.baseline).toMatchObject({
        outcome: 'inconclusive',
        reasonCode: 'missing-evidence',
        usage: { modelRequests: 2, toolCalls: 1, tokens: 0, cnyMilli: 0 },
      })
      expect(harness.ctx.tianwenEvolution.getSkillEvaluationResult(receipt.evaluationId))
        .toEqual(receipt.result)
    } finally {
      project.mockRestore()
      disposeParent()
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps over-budget exception usage durable with the budget reason', async () => {
    const root = stage4FixtureRoot('runtime-evidence-projection-budget-failure')
    const script = Array.from({ length: 8 }, (_, index) => [
      toolCallResponse(`verify-${index}`, 'verify_summary', { text: `case ${index}` }),
      textResponse(`scripted answer ${index}`),
    ]).flat()
    const harness = await mountCoreHarness([textResponse('host route remains unused')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary',
      parameters: { text: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'accepted' },
    }))
    const disposeParent = harness.ctx.skills.register(parent)
    await apply(harness.ctx, { evolutionRoot: root })
    const project = vi.spyOn(harness.ctx.tianwenEvidence, 'project').mockImplementation(() => {
      throw new Error('synthetic Evidence projection failure')
    })
    try {
      const seeded = seedCandidate(harness, {
        ...evaluationBudget(),
        maxModelRequestsPerArm: 1,
        maxToolCallsPerArm: 0,
        maxTotalModelRequests: 8,
        maxTotalToolCalls: 0,
      })
      const receipt = await harness.ctx.tianwenSkillEvaluation.run(evaluationInput(seeded, script))
      expect(receipt.result.cases[0]!.baseline).toMatchObject({
        outcome: 'inconclusive',
        reasonCode: 'arm-budget-exhausted',
        usage: { modelRequests: 2, toolCalls: 1, tokens: 0, cnyMilli: 0 },
      })
      expect(harness.ctx.tianwenEvolution.getSkillEvaluationResult(receipt.evaluationId))
        .toEqual(receipt.result)
    } finally {
      project.mockRestore()
      disposeParent()
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a request not assembled by the public DSH Agent loop', () => {
    expect(observeSkillEvaluationRequest({
      request,
      sessionId: 'session:paired-arm',
      preflight: config,
      paired: config,
      expectedSkillContent: '<skill_content>selected</skill_content>',
      skillName: parent.name,
      requestOrdinal: 1,
      maxModelRequests: 1,
    })).toEqual({ accepted: false, reason: 'not-agent-loop' })
  })

  it('accepts the one exact explicit Skill injection from a real DSH Agent request', async () => {
    const harness = await mountCoreHarness([textResponse('scripted answer')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    const disposeParent = harness.ctx.skills.register(parent)
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId('paired-evaluation-request'),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: '/research-summary' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      const actual = harness.adapter.requests[0]!
      const config = requestConfig(actual)
      const input = {
        request: actual,
        sessionId: String(actual.sessionId),
        preflight: config,
        paired: config,
        expectedSkillContent: renderSkillContent({
          name: parent.name,
          provider: 'runtime',
          content: parent.content,
        }),
        skillName: parent.name,
        requestOrdinal: 1,
        maxModelRequests: 1,
      } as const
      const observation = observeSkillEvaluationRequest(input)
      expect(observation).toEqual(expect.objectContaining({
        accepted: true,
        injectionMessageIndex: expect.any(Number),
        fullRequestDigest: expect.stringMatching(/^sha256:/u),
        normalizedFirstRequestDigest: expect.stringMatching(/^sha256:/u),
        catalogTargetCount: 1,
      }))
      expect(observeSkillEvaluationRequest({ ...input, sessionId: 'session:other' }))
        .toEqual({ accepted: false, reason: 'wrong-session' })
      expect(observeSkillEvaluationRequest({ ...input, requestOrdinal: 2 }))
        .toEqual({ accepted: false, reason: 'wrong-order-or-budget' })
      expect(observeSkillEvaluationRequest({
        ...input,
        preflight: { ...config, maxTokens: 1 },
      })).toEqual({ accepted: false, reason: 'call-config-mismatch' })
      expect(observeSkillEvaluationRequest({
        ...input,
        expectedSkillContent: 'different skill body',
      })).toEqual({ accepted: false, reason: 'skill-injection-mismatch' })
    } finally {
      await handle.dispose()
      disposeParent()
      await harness.ctx.fiber.dispose()
    }
  })

  it('normalizes only the paired Skill, arm identity, and pair-optional catalog entry', async () => {
    const harness = await mountCoreHarness([textResponse('scripted answer')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    const disposeParent = harness.ctx.skills.register(parent)
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId('paired-evaluation-normalization'),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: '/research-summary' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      const baseline = harness.adapter.requests[0]!
      const baselineSkill = renderSkillContent({
        name: parent.name,
        provider: 'runtime',
        content: parent.content,
      })
      const candidateSkill = renderSkillContent({
        name: candidate.name,
        provider: 'runtime',
        content: candidate.content,
      })
      const candidateRequest = {
        ...baseline,
        sessionId: 'session:paired-candidate',
        messages: baseline.messages.map(message =>
          message.role === 'user'
          && message.content.length === 1
          && message.content[0]?.type === 'text'
          && message.content[0].text === baselineSkill
            ? { ...message, content: [{ type: 'text', text: candidateSkill }] }
            : message),
      } as GenerateOptions
      const baselineNormalization = normalizeSkillEvaluationRequest({
        request: baseline,
        expectedSkillContent: baselineSkill,
        skillName: parent.name,
      })
      const candidateNormalization = normalizeSkillEvaluationRequest({
        request: candidateRequest,
        expectedSkillContent: candidateSkill,
        skillName: candidate.name,
      })
      expect(compareNormalizedSkillEvaluationRequests(
        baselineNormalization,
        candidateNormalization,
      )).toEqual({ accepted: true, normalizedFirstRequestDigest: expect.any(String) })
      expect(compareNormalizedSkillEvaluationRequests(
        baselineNormalization,
        normalizeSkillEvaluationRequest({
          request: { ...candidateRequest, messages: [...candidateRequest.messages, {
            id: 'message:catalog',
            role: 'system',
            content: [{ type: 'text', text: 'catalog' }],
            source: {
              kind: 'skill-catalog',
              entries: [{ name: candidate.name }, { name: 'ordinary-skill' }],
            },
          }] } as unknown as GenerateOptions,
          expectedSkillContent: candidateSkill,
          skillName: candidate.name,
        }),
      )).toEqual({ accepted: false, reason: 'asymmetric-skill-catalog' })
      const withCatalog = (
        request: GenerateOptions,
        selectedName: string,
        ordinaryName = 'ordinary-skill',
      ) => ({
        ...request,
        messages: [...request.messages.filter(message =>
          (message.source as { readonly kind?: string }).kind !== 'skill-catalog'), {
          id: `message:catalog:${selectedName}`,
          role: 'system',
          content: [{ type: 'text', text: 'catalog' }],
          source: {
            kind: 'skill-catalog',
            entries: [{ name: selectedName }, { name: ordinaryName }],
          },
        }],
      } as unknown as GenerateOptions)
      const baselineWithCatalog = normalizeSkillEvaluationRequest({
        request: withCatalog(baseline, parent.name),
        expectedSkillContent: baselineSkill,
        skillName: parent.name,
      })
      const candidateWithCatalog = normalizeSkillEvaluationRequest({
        request: withCatalog(candidateRequest, candidate.name),
        expectedSkillContent: candidateSkill,
        skillName: candidate.name,
      })
      expect(compareNormalizedSkillEvaluationRequests(
        baselineWithCatalog,
        candidateWithCatalog,
      )).toEqual({ accepted: true, normalizedFirstRequestDigest: expect.any(String) })
      expect(compareNormalizedSkillEvaluationRequests(
        baselineWithCatalog,
        normalizeSkillEvaluationRequest({
          request: withCatalog(candidateRequest, candidate.name, 'different-ordinary-skill'),
          expectedSkillContent: candidateSkill,
          skillName: candidate.name,
        }),
      )).toEqual({ accepted: false, reason: 'unequal-normalized-first-request' })
      expect(normalizeSkillEvaluationRequest({
        request: {
          ...candidateRequest,
          messages: [...candidateRequest.messages.filter(message =>
            (message.source as { readonly kind?: string }).kind !== 'skill-catalog'), {
            id: 'message:duplicate-catalog',
            role: 'system',
            content: [{ type: 'text', text: 'catalog' }],
            source: {
              kind: 'skill-catalog',
              entries: [{ name: candidate.name }, { name: candidate.name }],
            },
          }],
        } as unknown as GenerateOptions,
        expectedSkillContent: candidateSkill,
        skillName: candidate.name,
      })).toEqual({ accepted: false, reason: 'duplicate-skill-catalog-entry' })
    } finally {
      await handle.dispose()
      disposeParent()
      await harness.ctx.fiber.dispose()
    }
  })
})
