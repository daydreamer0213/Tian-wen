import {
  Service,
  SessionId,
  callConfigEquals,
  createUserMessage,
  isAgentLoopRequest,
  renderSkillContent,
} from '@tianwen/dsh-compat'
import type {
  AgentHandle,
  Context,
  GenerateOptions,
  LlmCallConfig,
  SessionEvent,
  SkillDefinition,
  SkillRegistration,
} from '@tianwen/dsh-compat'
import type { EvidenceRecord } from '@tianwen/evidence'
import {
  prepareRunBinding,
  prepareRunSkillManifest,
  prepareSkillEvaluationPlan,
  sha256,
} from '@tianwen/evolution'
import type {
  GovernedSkillCandidateId,
  Sha256Digest,
  SkillEvalCaseId,
  SkillEvalProtocolId,
  SkillEvaluationArmObservation,
  SkillEvaluationEnvironment,
  SkillEvaluationPlan,
  SkillEvaluationResult,
  TianwenRunId,
} from '@tianwen/evolution'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenSkillEvaluation: TianwenSkillEvaluationService
  }
}

export interface ObserveSkillEvaluationRequestInput {
  readonly request: GenerateOptions
  readonly sessionId: string
  readonly preflight: LlmCallConfig
  readonly paired: LlmCallConfig
  readonly expectedSkillContent: string
  readonly skillName: string
  readonly requestOrdinal: number
  readonly maxModelRequests: number
}

export interface NormalizeSkillEvaluationRequestInput {
  readonly request: GenerateOptions
  readonly expectedSkillContent: string
  readonly skillName: string
}

export type SkillEvaluationRequestNormalization =
  | { readonly accepted: false; readonly reason: string }
  | {
      readonly accepted: true
      readonly injectionMessageIndex: number
      readonly fullRequestDigest: `sha256:${string}`
      readonly normalizedFirstRequestDigest: `sha256:${string}`
      readonly catalogTargetCount: 0 | 1
    }

export type SkillEvaluationRequestObservation = SkillEvaluationRequestNormalization

export type NormalizedSkillEvaluationRequestComparison =
  | {
      readonly accepted: false
      readonly reason: 'asymmetric-skill-catalog' | 'unequal-normalized-first-request'
    }
  | {
      readonly accepted: true
      readonly normalizedFirstRequestDigest: `sha256:${string}`
    }

const NORMALIZED_SESSION = '<paired-evaluation-session>'
const NORMALIZED_SKILL_CONTENT = '<selected-skill-content>'
const NORMALIZED_CATALOG_ENTRY = Object.freeze({ name: '<selected-skill-catalog-entry>' })

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object'
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

function catalogEntries(message: unknown): readonly unknown[] | undefined {
  const source = record(record(message)?.source)
  return source?.kind === 'skill-catalog' && Array.isArray(source.entries)
    ? source.entries
    : undefined
}

function isTargetCatalogEntry(entry: unknown, skillName: string): boolean {
  return record(entry)?.name === skillName
}

function normalizeRequest(
  request: GenerateOptions,
  injectionMessageIndex: number,
  skillName: string,
): unknown {
  return {
    ...request,
    sessionId: NORMALIZED_SESSION,
    messages: request.messages.map((message, index) => {
      const entries = catalogEntries(message)
      if (index !== injectionMessageIndex && entries === undefined) {
        return { ...message, id: `<paired-evaluation-message:${index}>` }
      }
      return {
        ...message,
        id: `<paired-evaluation-message:${index}>`,
        ...(index === injectionMessageIndex
          ? { content: [{ type: 'text', text: NORMALIZED_SKILL_CONTENT }] }
          : {}),
        ...(entries === undefined
          ? {}
          : {
              source: {
                ...record(message.source),
                entries: entries.map(entry =>
                  isTargetCatalogEntry(entry, skillName) ? NORMALIZED_CATALOG_ENTRY : entry),
              },
            }),
      }
    }),
  }
}

export function normalizeSkillEvaluationRequest(
  input: NormalizeSkillEvaluationRequestInput,
): SkillEvaluationRequestNormalization {
  const injectionIndexes = input.request.messages.flatMap((message, index) =>
    message.role === 'user'
    && message.content.length === 1
    && message.content[0]?.type === 'text'
    && message.content[0].text === input.expectedSkillContent
      ? [index]
      : [])
  if (injectionIndexes.length !== 1) {
    return { accepted: false, reason: 'skill-injection-mismatch' }
  }
  const catalogTargetCount = input.request.messages
    .flatMap(message => catalogEntries(message) ?? [])
    .filter(entry => isTargetCatalogEntry(entry, input.skillName)).length
  if (catalogTargetCount > 1) {
    return { accepted: false, reason: 'duplicate-skill-catalog-entry' }
  }
  return {
    accepted: true,
    injectionMessageIndex: injectionIndexes[0]!,
    fullRequestDigest: sha256(input.request),
    normalizedFirstRequestDigest: sha256(normalizeRequest(
      input.request,
      injectionIndexes[0]!,
      input.skillName,
    )),
    catalogTargetCount: catalogTargetCount === 1 ? 1 : 0,
  }
}

export function compareNormalizedSkillEvaluationRequests(
  baseline: SkillEvaluationRequestNormalization,
  candidate: SkillEvaluationRequestNormalization,
): NormalizedSkillEvaluationRequestComparison {
  if (!baseline.accepted || !candidate.accepted
    || baseline.catalogTargetCount !== candidate.catalogTargetCount) {
    return { accepted: false, reason: 'asymmetric-skill-catalog' }
  }
  if (baseline.normalizedFirstRequestDigest !== candidate.normalizedFirstRequestDigest) {
    return { accepted: false, reason: 'unequal-normalized-first-request' }
  }
  return {
    accepted: true,
    normalizedFirstRequestDigest: baseline.normalizedFirstRequestDigest,
  }
}

function requestConfig(request: GenerateOptions): LlmCallConfig {
  return {
    provider: request.provider,
    model: request.model,
    ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
    ...(request.stop === undefined ? {} : { stop: request.stop }),
  }
}

function isSkillDefinition(skill: SkillRegistration): skill is SkillRegistration & SkillDefinition {
  if (
    typeof skill.name !== 'string'
    || typeof skill.description !== 'string'
    || typeof skill.content !== 'string'
    || typeof skill.source !== 'string'
    || typeof skill.provider !== 'string'
    || skill.invocation === undefined
    || typeof skill.invocation.modelInvocable !== 'boolean'
    || typeof skill.invocation.userInvocable !== 'boolean'
  ) return false
  return true
}

function sameSkillVersion(
  skill: SkillRegistration,
  expectedVersionId: SkillEvaluationPlan['parentVersionId'],
): boolean {
  if (!isSkillDefinition(skill)) return false
  return prepareRunSkillManifest({
    runId: `run:${sha256({ expectedVersionId, skill }).slice('sha256:'.length)}` as TianwenRunId,
    skill,
  }).parentVersionId === expectedVersionId
}

export function observeSkillEvaluationRequest(
  input: ObserveSkillEvaluationRequestInput,
): SkillEvaluationRequestObservation {
  if (!isAgentLoopRequest(input.request)) {
    return { accepted: false, reason: 'not-agent-loop' }
  }
  if (String(input.request.sessionId) !== input.sessionId) {
    return { accepted: false, reason: 'wrong-session' }
  }
  if (input.request.purpose !== undefined) {
    return { accepted: false, reason: 'non-ordinary-purpose' }
  }
  if (
    !Number.isSafeInteger(input.requestOrdinal)
    || input.requestOrdinal !== 1
    || input.requestOrdinal > input.maxModelRequests
  ) {
    return { accepted: false, reason: 'wrong-order-or-budget' }
  }
  const actual = requestConfig(input.request)
  if (!callConfigEquals(actual, input.preflight) || !callConfigEquals(actual, input.paired)) {
    return { accepted: false, reason: 'call-config-mismatch' }
  }
  return normalizeSkillEvaluationRequest(input)
}

export class TianwenSkillEvaluationService extends Service {
  static inject = [
    'tianwenEvidence',
    'tianwenEvolution',
    'tianwenLearningIntake',
    'skills',
  ] as const

  constructor(ctx: Context) {
    super(ctx, 'tianwenSkillEvaluation')
    ctx.on('llm/stream', (request, next) => {
      const sessionId = String(request.sessionId)
      const requests = this.requests.get(sessionId)
      if (requests !== undefined) requests.push(request)
      return next()
    })
  }

  private readonly requests = new Map<string, GenerateOptions[]>()

  async run(input: RunPairedSkillEvaluationInput): Promise<PairedSkillEvaluationReceipt> {
    const candidate = this.ctx.tianwenEvolution.getSkillCandidate(input.candidateId)
    const protocol = this.ctx.tianwenEvolution.getSkillEvalProtocol(input.protocolId)
    if (candidate === undefined || protocol === undefined || candidate.status !== 'recorded') {
      throw new Error('paired Skill evaluation requires a recorded Candidate and frozen protocol')
    }
    if (
      input.callConfig.provider !== 'scripted-adapter'
      || input.environment.providerId !== 'scripted-adapter'
      || protocol.protocol.execution.providerId !== 'scripted-adapter'
      || input.callConfig.reasoningEffort !== undefined
      || input.callConfig.temperature !== undefined
      || input.callConfig.stop !== undefined
      || protocol.protocol.budget.maxCnyMilliPerArm !== 0
      || protocol.protocol.budget.maxTotalCnyMilli !== 0
    ) {
      throw new Error('paired Skill evaluation only supports the zero-cost scripted mechanism')
    }
    const learningCase = this.ctx.tianwenEvolution.getLearningCase(candidate.caseId)
    const parentManifest = this.ctx.tianwenEvolution.listRunSkillManifests()
      .find(manifest => manifest.parentVersionId === candidate.parentVersionId)
    if (learningCase === undefined || parentManifest === undefined
      || candidate.targetScope !== learningCase.scopeKey
      || candidate.parentVersionId !== learningCase.parentVersionId
      || candidate.payload.invocation.userInvocable !== true
      || parentManifest.parent.invocation.userInvocable !== true) {
      throw new Error('paired Skill evaluation Candidate chain is not eligible')
    }
    let rootParentMatches = false
    await this.ctx.inject(['skills'], async scopedCtx => {
      const resolved = await scopedCtx.skills.get(parentManifest.parent.name)
      rootParentMatches = resolved !== undefined
        && sameSkillVersion(resolved, parentManifest.parentVersionId)
    })
    if (!rootParentMatches) {
      throw new Error('paired Skill evaluation cannot resolve its parent from the root Skill registry')
    }
    if (
      input.callConfig.provider !== protocol.protocol.execution.providerId
      || input.callConfig.model !== protocol.protocol.execution.modelId
      || sha256(input.callConfig) !== input.environment.callConfigDigest
    ) {
      throw new Error('paired Skill evaluation call config disagrees with its protocol')
    }
    const caseInputs = new Map(input.cases.map(item => [item.caseId, item.input]))
    if (caseInputs.size !== protocol.protocol.cases.length
      || protocol.protocol.cases.some(item => caseInputs.get(item.caseId) === undefined
        || sha256(caseInputs.get(item.caseId)) !== item.inputDigest)) {
      throw new Error('paired Skill evaluation inputs disagree with the frozen protocol')
    }

    const arms = protocol.protocol.cases.flatMap(protocolCase =>
      Array.from({ length: protocol.protocol.repetition.attempts }, (_, index) => {
        const attempt = index + 1
        const baseline = plannedBinding(protocolCase.caseId, attempt, 'baseline',
          protocolCase.acceptanceContract, learningCase.scopeKey, input.protocolId)
        const candidateArm = plannedBinding(protocolCase.caseId, attempt, 'candidate',
          protocolCase.acceptanceContract, learningCase.scopeKey, input.protocolId)
        return {
          caseId: protocolCase.caseId,
          attempt,
          baseline: { runId: baseline.runId, sessionId: baseline.sessionId },
          candidate: { runId: candidateArm.runId, sessionId: candidateArm.sessionId },
        }
      }))
    const expectedPlan = prepareSkillEvaluationPlan({
      candidateId: candidate.candidateId,
      protocolId: protocol.protocolId,
      environment: input.environment,
      arms,
    }, candidate, learningCase, protocol, sha256(parentManifest.parent))
    const completed = this.ctx.tianwenEvolution.getSkillEvaluationResult(expectedPlan.evaluationId)
    if (completed !== undefined) {
      return {
        evaluationId: expectedPlan.evaluationId,
        plan: this.ctx.tianwenEvolution.getSkillEvaluation(expectedPlan.evaluationId) ?? expectedPlan,
        result: completed,
      }
    }

    const prepared: PreparedSkillEvaluationArm[] = []
    try {
      for (const protocolCase of protocol.protocol.cases) {
        for (let attempt = 1; attempt <= protocol.protocol.repetition.attempts; attempt += 1) {
          for (const role of ['baseline', 'candidate'] as const) {
            const skill = role === 'baseline' ? parentManifest.parent : candidate.payload
            const registered = { ...skill, provider: parentManifest.resolvedProvider }
            const sessionId = evaluationSessionId(input.protocolId, protocolCase.caseId, attempt, role)
            const handle = await this.ctx.agents.create({
              sessionId: SessionId(sessionId),
              agentOptions: requestAgentOptions(input.callConfig),
              setup: async agentCtx => {
                await agentCtx.inject(['skills'], scopedCtx => {
                  scopedCtx.skills.register(registered as SkillRegistration)
                })
              },
            })
            let resolved = false
            await handle.agent.ctx.inject(['skills'], async scopedCtx => {
              const actual = await scopedCtx.skills.get(skill.name, {
                cwd: handle.agent.session.header.cwd,
                scope: handle.agent,
              })
              resolved = actual !== undefined
                && sameSkillVersion(actual, prepareRunSkillManifest({
                  runId: `run:${sha256({ sessionId, role }).slice('sha256:'.length)}` as TianwenRunId,
                  skill: registered,
                }).parentVersionId)
            })
            if (!resolved) {
              await handle.dispose()
              throw new Error('paired Skill evaluation failed to resolve its scoped Skill')
            }
            const surface = scopedSurface(handle)
            prepared.push({
              caseId: protocolCase.caseId,
              attempt,
              role,
              sessionId,
              handle,
              skill: registered,
              provider: parentManifest.resolvedProvider,
              skillVersionId: prepareRunSkillManifest({
                runId: `run:${sha256({
                  protocolId: input.protocolId,
                  caseId: protocolCase.caseId,
                  attempt,
                  role,
                }).slice('sha256:'.length)}` as TianwenRunId,
                skill: registered,
              }).parentVersionId,
              contentDigest: sha256(registered.content),
              ...surface,
            })
          }
        }
      }

      if (!prepared.every(arm =>
        arm.toolSchemaDigest === input.environment.toolSchemaDigest)) {
        throw new Error('paired Skill evaluation actual visible tool surface disagrees with its protocol')
      }

      const opened = this.ctx.tianwenEvolution.openSkillEvaluation({
        candidateId: candidate.candidateId,
        protocolId: protocol.protocolId,
        environment: input.environment,
        arms,
      })
      const plan = this.ctx.tianwenEvolution.getSkillEvaluation(opened.evaluationId)
      if (plan === undefined) throw new Error('paired Skill evaluation plan was not durable')

      for (const arm of prepared) {
        const planArm = findPlanArm(plan, arm.caseId, arm.attempt, arm.role)
        const protocolCase = protocol.protocol.cases.find(item => item.caseId === arm.caseId)!
        const binding = this.ctx.tianwenLearningIntake.bindRun(arm.handle.agent.session, {
          goalRef: `goal:skill-evaluation:${arm.caseId}:${arm.attempt}`,
          taskRef: `task:skill-evaluation:${arm.caseId}:${arm.attempt}:${arm.role}`,
          scopeKey: learningCase.scopeKey,
          acceptanceContract: protocolCase.acceptanceContract,
        })
        if (binding.runId !== planArm.runId) {
          throw new Error('paired Skill evaluation binding disagrees with its durable plan')
        }
        arm.runId = binding.runId
      }

      const observed = []
      for (const planCase of plan.cases) {
        const baseline = prepared.find(item => item.caseId === planCase.caseId
          && item.attempt === planCase.attempt && item.role === 'baseline')!
        const candidateArm = prepared.find(item => item.caseId === planCase.caseId
          && item.attempt === planCase.attempt && item.role === 'candidate')!
        const caseInput = caseInputs.get(planCase.caseId)!
        const baselineObservation = await this.runArm(
          baseline, planCase, caseInput, input.callConfig,
          protocol.protocol.budget,
          executionManifestDigest(plan, planCase),
        )
        const candidateObservation = await this.runArm(
          candidateArm, planCase, caseInput, input.callConfig,
          protocol.protocol.budget,
          executionManifestDigest(plan, planCase),
        )
        observed.push({
          caseId: planCase.caseId,
          attempt: planCase.attempt,
          baseline: baselineObservation,
          candidate: candidateObservation,
        })
      }
      await this.ctx.inject(['skills'], async scopedCtx => {
        const resolved = await scopedCtx.skills.get(parentManifest.parent.name)
        rootParentMatches = resolved !== undefined
          && sameSkillVersion(resolved, parentManifest.parentVersionId)
      })
      const resultReceipt = this.ctx.tianwenEvolution.recordSkillEvaluationResult({
        evaluationId: plan.evaluationId,
        cases: observed,
        baselineResolutionMatched: rootParentMatches,
      })
      const result = this.ctx.tianwenEvolution.getSkillEvaluationResult(resultReceipt.evaluationId)
      if (result === undefined) throw new Error('paired Skill evaluation result was not durable')
      return { evaluationId: plan.evaluationId, plan, result }
    } finally {
      for (const arm of prepared.reverse()) {
        this.requests.delete(arm.sessionId)
        await arm.handle.dispose()
      }
    }
  }

  private async runArm(
    arm: PreparedSkillEvaluationArm,
    planCase: SkillEvaluationPlan['cases'][number],
    input: string,
    callConfig: LlmCallConfig,
    budget: SkillEvaluationPlan['environment']['budget'],
    executionManifestDigest: Sha256Digest,
  ): Promise<SkillEvaluationArmObservation> {
    if (!input.startsWith(`/${arm.skill.name}`)) {
      throw new Error('paired Skill evaluation input must use the selected /skill-name')
    }
    const startedAt = Date.now()
    const requests: GenerateOptions[] = []
    this.requests.set(arm.sessionId, requests)
    let outcomeRecorded = false
    try {
      arm.handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: input }],
        source: { kind: 'user' },
      }))
      await arm.handle.agent.whenIdle()
      const allEvidence = this.ctx.tianwenEvidence.project(arm.handle.agent.session)
      const evidence = allEvidence
        .filter(item => item.action.toolName === planCase.acceptanceContract.toolName)
      const finalEvidence = evidence.at(-1)
      const usage = {
        modelRequests: requests.length,
        tokens: 0,
        toolCalls: allEvidence.length,
        elapsedMs: Date.now() - startedAt,
        cnyMilli: 0,
      }
      const withinBudget = usage.modelRequests <= budget.maxModelRequestsPerArm
        && usage.toolCalls <= budget.maxToolCallsPerArm
        && usage.elapsedMs <= budget.maxElapsedMsPerArm
      const outcome = outcomeFromEvidence(
        arm.handle.agent.session.events,
        finalEvidence,
        planCase.acceptanceContract.notMetErrorCode,
      )
      if (withinBudget) {
        this.ctx.tianwenLearningIntake.consumeOutcome(arm.handle.agent.session, arm.runId!)
      } else {
        this.ctx.tianwenEvolution.recordOutcomeIntake({
          runId: arm.runId!,
          verdict: 'inconclusive',
          sessionDigest: sha256(arm.handle.agent.session.events),
          evidenceIds: finalEvidence === undefined ? [] : [finalEvidence.evidenceId],
        })
      }
      outcomeRecorded = true
      const expectedSkillContent = renderSkillContent({
        name: arm.skill.name,
        provider: arm.provider,
        content: arm.skill.content,
      })
      const request = requests[0]
      const observation = request === undefined
        ? { accepted: false as const, reason: 'missing-evidence' }
        : observeSkillEvaluationRequest({
          request,
          sessionId: arm.sessionId,
          preflight: callConfig,
          paired: callConfig,
          expectedSkillContent,
          skillName: arm.skill.name,
          requestOrdinal: 1,
          maxModelRequests: budget.maxModelRequestsPerArm,
        })
      const validatorSubjectDigest = finalEvidence?.action.argumentsDigest
        ?? sha256({ sessionId: arm.sessionId, missingSubject: true })
      const evaluatedSubjectDigest = validatorSubjectDigest
      return {
        role: arm.role,
        runId: arm.runId!,
        sessionId: arm.sessionId,
        skillVersionId: arm.skillVersionId,
        contentDigest: arm.contentDigest,
        executionManifestDigest,
        fullRequestDigest: observation.accepted
          ? observation.fullRequestDigest
          : sha256({ sessionId: arm.sessionId, missingRequest: true }),
        normalizedFirstRequestDigest: observation.accepted
          ? observation.normalizedFirstRequestDigest
          : sha256({ sessionId: arm.sessionId, missingRequest: true }),
        injectionProofDigest: sha256(expectedSkillContent),
        outcome: withinBudget ? outcome : 'inconclusive',
        evidenceIds: finalEvidence === undefined ? [] : [finalEvidence.evidenceId],
        validatorReceiptDigest: sha256({
          evidenceId: finalEvidence?.evidenceId ?? null,
          subjectDigest: validatorSubjectDigest,
        }),
        validatorSubjectDigest,
        evaluatedSubjectDigest,
        usage,
        ...(!observation.accepted || !withinBudget || finalEvidence === undefined
          ? { reasonCode: !withinBudget ? 'arm-budget-exhausted' as const : 'missing-evidence' as const }
          : {}),
      }
    } catch {
      const usage = {
        modelRequests: requests.length,
        tokens: 0,
        toolCalls: this.ctx.tianwenEvidence.project(arm.handle.agent.session).length,
        elapsedMs: Date.now() - startedAt,
        cnyMilli: 0,
      }
      if (!outcomeRecorded) {
        this.ctx.tianwenEvolution.recordOutcomeIntake({
          runId: arm.runId!,
          verdict: 'inconclusive',
          sessionDigest: sha256(arm.handle.agent.session.events),
          evidenceIds: [],
        })
      }
      return inconclusiveArmObservation(
        arm,
        executionManifestDigest,
        sha256({
          name: arm.skill.name,
          provider: arm.provider,
          content: arm.skill.content,
        }),
        usage,
      )
    }
  }
}

function inconclusiveArmObservation(
  arm: PreparedSkillEvaluationArm,
  executionManifestDigest: Sha256Digest,
  injectionProofDigest: Sha256Digest,
  usage: SkillEvaluationArmObservation['usage'],
): SkillEvaluationArmObservation {
  const subjectDigest = sha256({ sessionId: arm.sessionId, missingSubject: true })
  return {
    role: arm.role,
    runId: arm.runId!,
    sessionId: arm.sessionId,
    skillVersionId: arm.skillVersionId,
    contentDigest: arm.contentDigest,
    executionManifestDigest,
    fullRequestDigest: sha256({ sessionId: arm.sessionId, missingRequest: true }),
    normalizedFirstRequestDigest: sha256({ sessionId: arm.sessionId, missingRequest: true }),
    injectionProofDigest,
    outcome: 'inconclusive',
    evidenceIds: [],
    validatorReceiptDigest: sha256({ evidenceId: null, subjectDigest }),
    validatorSubjectDigest: subjectDigest,
    evaluatedSubjectDigest: subjectDigest,
    usage,
    reasonCode: 'missing-evidence',
  }
}

function executionManifestDigest(
  plan: SkillEvaluationPlan,
  evaluationCase: SkillEvaluationPlan['cases'][number],
): Sha256Digest {
  return sha256({
    environment: plan.environment,
    case: {
      caseId: evaluationCase.caseId,
      inputDigest: evaluationCase.inputDigest,
      dataSnapshotDigest: evaluationCase.dataSnapshotDigest,
      acceptanceContract: evaluationCase.acceptanceContract,
    },
  })
}

function outcomeFromEvidence(
  events: readonly SessionEvent[],
  evidence: EvidenceRecord | undefined,
  notMetErrorCode: string,
): 'met' | 'not-met' | 'inconclusive' {
  const terminal = events.findLast(event => event.type === 'turn/start' || event.type === 'turn/end')
  if (terminal?.type !== 'turn/end' || terminal.data.reason.kind !== 'completed'
    || evidence?.outcome.status !== 'complete') {
    return 'inconclusive'
  }
  if (evidence.outcome.isError === false) return 'met'
  return evidence.outcome.errorCode === notMetErrorCode ? 'not-met' : 'inconclusive'
}

export interface PairedSkillEvaluationCaseInput {
  readonly caseId: SkillEvalCaseId
  readonly input: string
}

export interface RunPairedSkillEvaluationInput {
  readonly candidateId: GovernedSkillCandidateId
  readonly protocolId: SkillEvalProtocolId
  readonly environment: SkillEvaluationEnvironment
  readonly callConfig: LlmCallConfig
  readonly cases: readonly PairedSkillEvaluationCaseInput[]
}

export interface PairedSkillEvaluationReceipt {
  readonly evaluationId: SkillEvaluationPlan['evaluationId']
  readonly plan: SkillEvaluationPlan
  readonly result: SkillEvaluationResult
}

interface PreparedSkillEvaluationArm {
  readonly caseId: SkillEvalCaseId
  readonly attempt: number
  readonly role: 'baseline' | 'candidate'
  readonly sessionId: string
  readonly handle: AgentHandle
  readonly skill: SkillRegistration
  readonly provider: string
  readonly skillVersionId: SkillEvaluationArmObservation['skillVersionId']
  readonly contentDigest: Sha256Digest
  readonly toolSchemaDigest: Sha256Digest
  runId?: TianwenRunId
}

function scopedSurface(handle: AgentHandle): {
  readonly toolSchemaDigest: Sha256Digest
} {
  const schemas = handle.agent.ctx.tools.schemas(handle.agent)
    .toSorted((left, right) => left.name.localeCompare(right.name))
  return {
    toolSchemaDigest: sha256(schemas),
  }
}

function requestAgentOptions(config: LlmCallConfig) {
  return {
    provider: config.provider,
    model: config.model,
    ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
  }
}

function evaluationSessionId(
  protocolId: SkillEvalProtocolId,
  caseId: SkillEvalCaseId,
  attempt: number,
  role: 'baseline' | 'candidate',
): string {
  return `session:skill-eval:${protocolId.slice(-12)}:${caseId}:${attempt}:${role}`
}

function plannedBinding(
  caseId: SkillEvalCaseId,
  attempt: number,
  role: 'baseline' | 'candidate',
  acceptanceContract: SkillEvaluationPlan['cases'][number]['acceptanceContract'],
  scopeKey: string,
  protocolId: SkillEvalProtocolId,
) {
  const sessionId = evaluationSessionId(protocolId, caseId, attempt, role)
  return prepareRunBinding({
    goalRef: `goal:skill-evaluation:${caseId}:${attempt}`,
    taskRef: `task:skill-evaluation:${caseId}:${attempt}:${role}`,
    sessionId,
    scopeKey,
    acceptanceContract,
  })
}

function findPlanArm(
  plan: SkillEvaluationPlan,
  caseId: SkillEvalCaseId,
  attempt: number,
  role: 'baseline' | 'candidate',
) {
  const evaluationCase = plan.cases.find(item => item.caseId === caseId && item.attempt === attempt)
  if (evaluationCase === undefined) throw new Error('paired Skill evaluation plan row is missing')
  return evaluationCase[role]
}
