import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { SkillDefinition, SkillRegistration } from '@deepseek-ai/dsh-skill'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  learningSessionLifecycleFingerprint,
  prepareRunSkillManifest,
  sha256,
  type ControlledSkillScopePointer,
  type GovernedSkillCandidate,
  type RunSkillManifest,
  type TianwenRunId,
} from '@tianwen/evolution'
import {
  RESEARCH_SUMMARY_BASE_SKILL,
  RESEARCH_SUMMARY_SCOPE,
  RESEARCH_SUMMARY_SKILL_NAME,
  RESEARCH_SUMMARY_TOOL_NAME,
  createResearchSummaryTool,
  parseResearchPacket,
  type ResearchPacket,
} from '@tianwen/runtime'
import { renderSkillContent } from '@deepseek-ai/dsh-skill'

const GOAL_REF = 'goal:research-summary-source'
const TASK_REF = 'task:research-summary-source'
const NOT_MET_ERROR_CODE = 'RESEARCH_SUMMARY_NOT_MET'
const VERSION_RUN_ID = `run:${'0'.repeat(64)}` as TianwenRunId
const SKILL_GESTURE = /^\s*\/research-summary(?=\s|$)/u

interface ParsedGesture {
  readonly packet: ResearchPacket
  readonly messageId: string
}

interface InstalledAdmission {
  readonly runId: TianwenRunId
  readonly packet: ResearchPacket
  readonly skill: SkillDefinition
  readonly tool: ToolDefinition
  readonly dispose: () => Promise<void>
  reconciliation?: Promise<void>
}

interface FrozenSelection {
  readonly skill: SkillDefinition
  readonly pointer?: ControlledSkillScopePointer
}

type StepPreparation =
  | { readonly kind: 'ordinary' }
  | { readonly kind: 'reject' }
  | {
      readonly kind: 'fresh'
      readonly gesture: ParsedGesture
      readonly selection: FrozenSelection
      readonly installed: InstalledAdmission
    }
  | {
      readonly kind: 'restore'
      readonly installed: InstalledAdmission
    }
  | {
      readonly kind: 'live'
      readonly installed: InstalledAdmission
    }

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenResearchSummaryAdmission: TianwenResearchSummaryAdmissionService
  }
}

function isRootSession(agent: Agent): boolean {
  const header = agent.session.header
  return header.parentSession === undefined && header.origin !== 'subagent'
}

function exactObject(value: unknown, expected: unknown): boolean {
  return sha256(value) === sha256(expected)
}

function skillShape(skill: SkillDefinition): Readonly<Record<string, unknown>> {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    invocation: {
      modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable,
    },
    source: skill.source,
    provider: skill.provider,
    content: skill.content,
  }
}

function exactPackagedBase(skill: SkillDefinition | undefined): skill is SkillDefinition {
  return skill !== undefined
    && skill.path === undefined
    && skill.metadata === undefined
    && skill.resourceBase === undefined
    && exactObject(skillShape(skill), skillShape(RESEARCH_SUMMARY_BASE_SKILL as SkillDefinition))
}

function freezeSkill(registration: SkillRegistration): SkillDefinition {
  const invocation = Object.freeze({
    modelInvocable: registration.invocation?.modelInvocable ?? true,
    userInvocable: registration.invocation?.userInvocable ?? true,
  })
  return Object.freeze({
    name: registration.name,
    description: registration.description,
    ...(registration.whenToUse === undefined ? {} : { whenToUse: registration.whenToUse }),
    invocation,
    source: registration.source,
    provider: registration.provider ?? 'runtime',
    content: registration.content,
  })
}

function skillFromManifest(manifest: RunSkillManifest): SkillDefinition {
  return freezeSkill({
    ...manifest.parent,
    provider: manifest.resolvedProvider,
  })
}

function versionOf(skill: SkillDefinition): string {
  return prepareRunSkillManifest({ runId: VERSION_RUN_ID, skill }).parentVersionId
}

function payloadDigestOf(skill: SkillDefinition): string {
  const manifest = prepareRunSkillManifest({ runId: VERSION_RUN_ID, skill })
  return sha256(manifest.parent)
}

function parseGesture(messages: readonly UserMessage[]): ParsedGesture | undefined {
  const direct = messages.filter(message => message.source.kind === 'user')
  if (direct.length !== 1) return undefined
  const message = direct[0]!
  if (message.content.length !== 1 || message.content[0]?.type !== 'text') return undefined
  const text = message.content[0].text
  const match = SKILL_GESTURE.exec(text)
  if (match === null) return undefined
  const source = text.slice(match[0].length).trim()
  try {
    return { packet: parseResearchPacket(source), messageId: String(message.id) }
  } catch {
    return undefined
  }
}

function packetFromEvents(
  events: readonly { readonly type: string, readonly data: unknown }[],
  expectedDigest: string,
): ParsedGesture | undefined {
  const matches: ParsedGesture[] = []
  for (const event of events) {
    if (event.type !== 'user/message'
      || event.data === null
      || typeof event.data !== 'object') continue
    const parsed = parseGesture([event.data as UserMessage])
    if (parsed !== undefined && sha256(parsed.packet) === expectedDigest) matches.push(parsed)
  }
  return matches.length === 1 ? matches[0] : undefined
}

function catalogEntry(message: UserMessage, name: string): unknown {
  const source = message.source as unknown as {
    readonly kind?: unknown
    readonly form?: unknown
    readonly entries?: readonly unknown[]
  }
  if (source.kind !== 'skill-catalog' || source.form !== 'catalog') return undefined
  return source.entries?.find(entry => entry !== null
    && typeof entry === 'object'
    && (entry as { readonly name?: unknown }).name === name)
}

function verifyNativeDecision(
  decision: { readonly kind: 'reject' } | { readonly kind: 'enter', readonly messages: UserMessage[] },
  skill: SkillDefinition,
  requireInvocation: boolean,
  requireCatalog: boolean,
): boolean {
  if (decision.kind !== 'enter') return false
  const expectedInstructions = renderSkillContent(skill)
  const invocations = decision.messages.filter(message => {
    const source = message.source as unknown as {
      readonly kind?: unknown
      readonly name?: unknown
      readonly form?: unknown
    }
    return source.kind === 'skill-invocation' && source.name === skill.name
      && source.form === 'instructions'
  })
  if (requireInvocation && invocations.length !== 1) return false
  if (invocations.some(message => message.content.length !== 1
    || message.content[0]?.type !== 'text'
    || message.content[0].text !== expectedInstructions)) return false

  const catalogEntries = decision.messages
    .map(message => catalogEntry(message, skill.name))
    .filter(entry => entry !== undefined)
  if (requireCatalog && catalogEntries.length !== 1) return false
  return catalogEntries.every(entry => exactObject(entry, {
    name: skill.name,
    description: skill.description.replaceAll(/\s+/gu, ' ').trim(),
  }))
}

type VisibleToolSchema = ReturnType<Context['tools']['schemas']>[number]

function exactSchema(left: VisibleToolSchema | undefined, right: VisibleToolSchema): boolean {
  return left !== undefined && exactObject(left, right)
}

export class TianwenResearchSummaryAdmissionService extends Service {
  static inject = [
    'agents',
    'sessions',
    'sessionPersistence',
    'skills',
    'tools',
    'tianwenEvolution',
    'tianwenLearningIntake',
  ] as const

  private readonly installed = new Map<Agent, InstalledAdmission>()
  private readonly claimed = new Map<Agent, UserMessage[]>()
  private readonly prepared = new Map<Agent, StepPreparation>()
  private readonly pending = new Set<Promise<void>>()

  constructor(ctx: Context) {
    super(ctx, 'tianwenResearchSummaryAdmission')
  }

  protected [Service.init](): void {
    const disposeBase = this.ctx.skills.register(RESEARCH_SUMMARY_BASE_SKILL)
    const offClaimed = this.ctx.on('agent/inbox/claimed', ({ agent, message }) => {
      const messages = this.claimed.get(agent) ?? []
      messages.push(message)
      this.claimed.set(agent, messages)
    })
    const offAssembly = this.ctx.on('system-prompt/assemble', async (
      assembly,
      context,
      next,
    ) => {
      const agent = (context as typeof context & { readonly agent?: Agent }).agent
      if (agent === undefined || !isRootSession(agent)) return next()
      const preparation = await this.prepareAssembly(
        agent,
        this.claimed.get(agent) ?? [],
        context.signal,
      )
      this.prepared.set(agent, preparation)
      if (preparation.kind !== 'fresh'
        && preparation.kind !== 'restore'
        && preparation.kind !== 'live') return next()
      // DSH freezes visible tool schemas during system-prompt assembly, before
      // agent/pre-step performs the native Skill invocation. The scoped tool is
      // already registered above, so project its exact schema into this same
      // frozen assembly and verify that no later provider changed it.
      const expected = toolSchema(preparation.installed.tool)
      const existing = assembly.tools.filter(tool => tool.name === expected.name)
      if (existing.length > 1 || (existing.length === 1 && !exactSchema(existing[0], expected))) {
        if (preparation.kind !== 'live') await preparation.installed.dispose()
        this.prepared.set(agent, { kind: 'reject' })
        return next()
      }
      if (existing.length === 0) assembly.tools.push(expected)
      const assembled = await next()
      const resolved = assembled.tools.filter(tool => tool.name === expected.name)
      if (resolved.length !== 1 || !exactSchema(resolved[0], expected)) {
        if (preparation.kind !== 'live') await preparation.installed.dispose()
        this.prepared.set(agent, { kind: 'reject' })
      }
      return assembled
    }, { prepend: true })
    const offPreStep = this.ctx.on('agent/pre-step', (payload, next) =>
      this.admit(payload, next), { prepend: true })
    const offSession = this.ctx.on('session/event', (session, event) => {
      if (event.type !== 'turn/end') return
      const agent = this.ctx.agents.get(session.id)
      const installed = agent === undefined ? undefined : this.installed.get(agent)
      if (agent !== undefined) {
        this.claimed.delete(agent)
        this.prepared.delete(agent)
      }
      if (agent === undefined || installed === undefined || event.data.turn !== 1) return
      this.reconcile(agent, installed)
    })
    const offDisposed = this.ctx.on('agent/disposed', ({ agent }) => {
      const installed = this.installed.get(agent)
      this.installed.delete(agent)
      this.claimed.delete(agent)
      const preparation = this.prepared.get(agent)
      this.prepared.delete(agent)
      if ((preparation?.kind === 'fresh' || preparation?.kind === 'restore')
        && preparation.installed !== installed) void preparation.installed.dispose()
      if (installed !== undefined) void installed.dispose()
    })
    this.ctx.effect(() => async () => {
      offDisposed()
      offSession()
      offPreStep()
      offAssembly()
      offClaimed()
      await Promise.allSettled([...this.pending])
      await Promise.allSettled([...this.prepared.values()].flatMap(value =>
        value.kind === 'fresh' || value.kind === 'restore'
          ? [value.installed.dispose()]
          : []))
      this.prepared.clear()
      this.claimed.clear()
      await Promise.allSettled([...this.installed.values()].map(value => value.dispose()))
      this.installed.clear()
      disposeBase()
    }, 'tianwen-research-summary-admission.dispose')
  }

  async whenIdle(): Promise<void> {
    await Promise.allSettled([...this.pending])
  }

  private async prepareAssembly(
    agent: Agent,
    messages: readonly UserMessage[],
    signal?: AbortSignal,
  ): Promise<StepPreparation> {
    const live = this.installed.get(agent)
    if (live !== undefined) {
      return this.verifyBoundFacts(agent, live)
        && await this.verifySkillLayer(agent, live.skill, signal)
        && this.verifyLayer(agent, live.skill, live.tool)
        ? { kind: 'live', installed: live }
        : { kind: 'reject' }
    }

    const existing = this.ctx.tianwenEvolution
      .getRunBindingBySessionId(String(agent.session.id))
    if (existing !== undefined) {
      try {
        return {
          kind: 'restore',
          installed: await this.restore({ agent, signal: signal ?? new AbortController().signal }, existing.runId),
        }
      } catch {
        return { kind: 'reject' }
      }
    }

    const gesture = parseGesture(messages)
    const firstTurn = agent.session.events.filter(event => event.type === 'turn/start')
    if (gesture === undefined
      || firstTurn.length !== 1
      || firstTurn[0]?.type !== 'turn/start'
      || firstTurn[0].data.turn !== 1
      || agent.session.events.some(event => event.type === 'turn/end'
        || event.type === 'step/start'
        || event.type === 'request/header')) {
      return { kind: 'ordinary' }
    }

    const lookup = { cwd: agent.session.header.cwd, signal, scope: agent }
    const base = await this.ctx.skills.get(RESEARCH_SUMMARY_SKILL_NAME, lookup)
    if (!exactPackagedBase(base)) return { kind: 'ordinary' }
    try {
      const selection = this.select(base)
      const installed = await this.install(
        agent, selection.skill, gesture.packet, 'pending' as TianwenRunId,
      )
      if (!await this.verifySkillLayer(agent, selection.skill, signal)
        || !this.verifyLayer(agent, selection.skill, installed.tool)) {
        await installed.dispose()
        return { kind: 'reject' }
      }
      return { kind: 'fresh', gesture, selection, installed }
    } catch {
      return { kind: 'reject' }
    }
  }

  private async admit(
    payload: {
      readonly agent: Agent
      readonly messages: UserMessage[]
      readonly turn: number
      readonly step: number
      readonly signal: AbortSignal
    },
    next: () => Promise<{ kind: 'reject' } | { kind: 'enter', messages: UserMessage[] }>,
  ) {
    const { agent } = payload
    if (!isRootSession(agent)) return next()
    const preparation = this.prepared.get(agent)
    this.prepared.delete(agent)
    this.claimed.delete(agent)
    if (preparation === undefined || preparation.kind === 'ordinary') return next()
    if (preparation.kind === 'reject') return { kind: 'reject' as const }
    if (preparation.kind === 'live') {
      return this.continueBound(payload, next, preparation.installed)
    }
    if (preparation.kind === 'restore') {
      const { installed } = preparation
      try {
        const decision = await next()
        if (!await this.verifySkillLayer(agent, installed.skill, payload.signal)
          || !this.verifyLayer(agent, installed.skill, installed.tool)
          || !verifyNativeDecision(
            decision,
            installed.skill,
            parseGesture(payload.messages) !== undefined,
            false,
          )) throw new Error('restored research summary native layer drift')
        this.installed.set(agent, installed)
        return decision
      } catch {
        await installed.dispose()
        return { kind: 'reject' as const }
      }
    }

    const { gesture, selection, installed } = preparation
    try {
      const decision = await next()
      if (!this.samePointer(selection.pointer)
        || !await this.verifySkillLayer(agent, selection.skill, payload.signal)
        || !this.verifyLayer(agent, selection.skill, installed.tool)
        || !verifyNativeDecision(decision, selection.skill, true, true)) {
        throw new Error('research summary native Skill admission drift')
      }
      const receipt = this.ctx.tianwenLearningIntake.bindInitialStepWithSkill(
        agent.session,
        {
          goalRef: GOAL_REF,
          taskRef: TASK_REF,
          scopeKey: RESEARCH_SUMMARY_SCOPE,
          acceptanceContract: {
            source: 'dsh-tool-result',
            toolName: RESEARCH_SUMMARY_TOOL_NAME,
            notMetErrorCode: NOT_MET_ERROR_CODE,
            gapDisposition: 'reusable',
            problemCategory: 'research-summary-correction',
            severity: 2,
            blocksGoal: false,
          },
          acceptanceSubjectDigest: sha256(gesture.packet),
        },
        selection.skill,
      )
      if (receipt.parentVersionId !== versionOf(selection.skill)) {
        throw new Error('research summary frozen manifest drift')
      }
      const accepted: InstalledAdmission = { ...installed, runId: receipt.runId }
      this.installed.set(agent, accepted)
      return decision
    } catch {
      await installed.dispose()
      return { kind: 'reject' as const }
    }
  }

  private async continueBound(
    payload: {
      readonly agent: Agent
      readonly messages: UserMessage[]
    },
    next: () => Promise<{ kind: 'reject' } | { kind: 'enter', messages: UserMessage[] }>,
    installed: InstalledAdmission,
  ) {
    if (!this.verifyBoundFacts(payload.agent, installed)
      || !await this.verifySkillLayer(payload.agent, installed.skill)
      || !this.verifyLayer(payload.agent, installed.skill, installed.tool)) {
      return { kind: 'reject' as const }
    }
    const decision = await next()
    return this.verifyBoundFacts(payload.agent, installed)
      && await this.verifySkillLayer(payload.agent, installed.skill)
      && this.verifyLayer(payload.agent, installed.skill, installed.tool)
      && verifyNativeDecision(
        decision,
        installed.skill,
        parseGesture(payload.messages) !== undefined,
        false,
      )
      ? decision
      : { kind: 'reject' as const }
  }

  private select(base: SkillDefinition): FrozenSelection {
    const pointer = this.ctx.tianwenEvolution
      .getControlledSkillScopePointer(RESEARCH_SUMMARY_SCOPE)
    if (pointer === undefined) return { skill: freezeSkill(base) }
    if (pointer.activeVersionId === versionOf(base)
      && pointer.payloadDigest === payloadDigestOf(base)) {
      return { skill: freezeSkill(base), pointer }
    }
    const candidates = this.ctx.tianwenEvolution.listSkillCandidates()
      .filter(candidate => this.matchesPointer(candidate, pointer, base))
    if (candidates.length !== 1) {
      throw new Error('controlled research summary pointer lacks one exact Candidate')
    }
    return {
      skill: freezeSkill({ ...candidates[0]!.payload, provider: base.provider }),
      pointer,
    }
  }

  private matchesPointer(
    candidate: GovernedSkillCandidate,
    pointer: ControlledSkillScopePointer,
    base: SkillDefinition,
  ): boolean {
    if (candidate.targetScope !== RESEARCH_SUMMARY_SCOPE
      || candidate.payloadDigest !== pointer.payloadDigest) return false
    const skill = freezeSkill({ ...candidate.payload, provider: base.provider })
    return versionOf(skill) === pointer.activeVersionId
  }

  private samePointer(expected: ControlledSkillScopePointer | undefined): boolean {
    const current = this.ctx.tianwenEvolution
      .getControlledSkillScopePointer(RESEARCH_SUMMARY_SCOPE)
    return expected === undefined ? current === undefined : exactObject(current, expected)
  }

  private async install(
    agent: Agent,
    skill: SkillDefinition,
    packet: ResearchPacket,
    runId: TianwenRunId,
  ): Promise<InstalledAdmission> {
    const tool = createResearchSummaryTool(packet, { kind: 'source-capture' })
    let disposeSkill: (() => void) | undefined
    let disposeTool: (() => void) | undefined
    try {
      await agent.ctx.inject(['skills', 'tools'], scoped => {
        disposeSkill = scoped.skills.register(skill)
        disposeTool = scoped.tools.register(tool)
      })
    } catch (error) {
      disposeSkill?.()
      throw error
    }
    let disposed = false
    return {
      runId,
      packet,
      skill,
      tool,
      async dispose() {
        if (disposed) return
        disposed = true
        disposeTool?.()
        disposeSkill?.()
      },
    }
  }

  private verifyLayer(agent: Agent, skill: SkillDefinition, tool: ToolDefinition): boolean {
    const resolvedTool = this.ctx.tools.get(RESEARCH_SUMMARY_TOOL_NAME, agent)
    if (resolvedTool !== tool) return false
    const schema = toolSchema(tool)
    const visible = this.ctx.tools.schemas(agent)
      .filter(candidate => candidate.name === RESEARCH_SUMMARY_TOOL_NAME)
    if (visible.length !== 1 || !exactSchema(visible[0], schema)) return false
    return true
  }

  private async verifySkillLayer(
    agent: Agent,
    skill: SkillDefinition,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const lookup = { cwd: agent.session.header.cwd, scope: agent, signal }
    const [loaded, snapshot] = await Promise.all([
      this.ctx.skills.get(skill.name, lookup),
      this.ctx.skills.snapshot(lookup),
    ])
    if (loaded === undefined || !snapshot.complete) return false
    const summary = snapshot.skills.filter(value => value.name === skill.name)
    return summary.length === 1
      && exactObject(skillShape(loaded), skillShape(skill))
      && exactObject(summary[0], {
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
        invocation: skill.invocation,
        source: skill.source,
        provider: skill.provider,
      })
  }

  private verifyBoundFacts(agent: Agent, installed: InstalledAdmission): boolean {
    const binding = this.ctx.tianwenEvolution.getRunBinding(installed.runId)
    const manifest = this.ctx.tianwenEvolution.getRunSkillManifest(installed.runId)
    return binding?.schemaVersion === 'tianwen.run-binding.v3'
      && binding.sessionId === String(agent.session.id)
      && binding.sessionLifecycleFingerprint === learningSessionLifecycleFingerprint({
        sessionId: String(agent.session.id),
        createdAt: agent.session.header.createdAt,
        ...(agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd }),
      })
      && binding.acceptanceSubjectDigest === sha256(installed.packet)
      && manifest !== undefined
      && exactObject(skillFromManifest(manifest), installed.skill)
  }

  private async restore(
    payload: { readonly agent: Agent, readonly signal: AbortSignal },
    runId: TianwenRunId,
  ): Promise<InstalledAdmission> {
    const { agent } = payload
    const binding = this.ctx.tianwenEvolution.getRunBinding(runId)
    const manifest = this.ctx.tianwenEvolution.getRunSkillManifest(runId)
    if (binding?.schemaVersion !== 'tianwen.run-binding.v3'
      || manifest === undefined
      || manifest.runId !== binding.runId
      || binding.sessionId !== String(agent.session.id)
      || binding.scopeKey !== RESEARCH_SUMMARY_SCOPE
      || binding.acceptanceContract.toolName !== RESEARCH_SUMMARY_TOOL_NAME
      || binding.acceptanceSubjectDigest === undefined
      || binding.sessionLifecycleFingerprint !== learningSessionLifecycleFingerprint({
        sessionId: String(agent.session.id),
        createdAt: agent.session.header.createdAt,
        ...(agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd }),
      })) {
      throw new Error('persisted research summary binding is incomplete')
    }
    const persisted = await this.ctx.sessionPersistence.inspect(agent.session.id)
    if (String(persisted.meta.id) !== String(agent.session.id)
      || binding.sessionLifecycleFingerprint !== learningSessionLifecycleFingerprint({
        sessionId: String(persisted.meta.id),
        createdAt: persisted.meta.createdAt,
        ...(persisted.meta.cwd === undefined ? {} : { cwd: persisted.meta.cwd }),
      })) {
      throw new Error('persisted research summary Session identity drift')
    }
    const gesture = packetFromEvents(persisted.events, binding.acceptanceSubjectDigest)
    if (gesture === undefined) throw new Error('persisted research summary packet is unavailable')
    const skill = skillFromManifest(manifest)
    const installed = await this.install(agent, skill, gesture.packet, runId)
    if (!await this.verifySkillLayer(agent, skill, payload.signal)
      || !this.verifyLayer(agent, skill, installed.tool)
      || !this.verifyBoundFacts(agent, installed)) {
      await installed.dispose()
      throw new Error('restored research summary admission layer drift')
    }
    return installed
  }

  private reconcile(agent: Agent, installed: InstalledAdmission): void {
    if (installed.reconciliation !== undefined) return
    const work = agent.whenIdle()
      .then(async () => {
        if (this.installed.get(agent) !== installed) return
        if (!await this.ctx.sessions.flush(agent.session)) return
        this.ctx.tianwenLearningIntake.consumeOutcome(agent.session, installed.runId)
        this.ctx.tianwenLearningIntake.recordSkillUse(agent.session, installed.runId)
      })
      .catch(() => undefined)
      .finally(() => this.pending.delete(work))
    installed.reconciliation = work
    this.pending.add(work)
  }
}

function toolSchema(tool: ToolDefinition): VisibleToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    parameters: structuredClone(tool.parameters),
  }
}
