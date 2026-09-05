import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  CallId,
  SessionId,
  defineTool,
  mountGoalHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apply as applyCore } from '../../packages/tianwen-runtime/src/index.js'
import {
  LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID,
  LEARNING_CONSENT_NOTICE_TEXT,
  TianwenLearningConsentAgentService,
} from '../../packages/tianwen-runtime-bundle/src/learning-consent-agent.js'

const roots: string[] = []

function nextTurn(): Promise<void> {
  return new Promise(resolveTurn => setImmediate(resolveTurn))
}

function deferred(): {
  readonly promise: Promise<void>
  readonly resolve: () => void
} {
  let resolvePromise!: () => void
  const promise = new Promise<void>(resolve => { resolvePromise = resolve })
  return { promise, resolve: resolvePromise }
}

function tempRoot(prefix: string): string {
  const base = process.platform === 'win32'
    ? 'D:/DevData/tianwen-learning-consent-agent-tests'
    : resolve('tmp/tianwen-learning-consent-agent-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, `${prefix}-`))
  roots.push(root)
  return root
}

async function mountConsentRuntimeAt(
  root: string,
  responses: Parameters<typeof mountGoalHarness>[1] = [],
) {
  const harness = await mountGoalHarness(join(root, 'sessions'), responses, {
    goalRoundDriver: false,
  })
  await applyCore(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  const consentFiber = harness.ctx.plugin(TianwenLearningConsentAgentService)
  await consentFiber
  return { ...harness, root, consentFiber }
}

async function mountConsentRuntime(
  prefix: string,
  responses: Parameters<typeof mountGoalHarness>[1] = [],
) {
  return mountConsentRuntimeAt(tempRoot(prefix), responses)
}

async function createMainAndChild(ctx: Awaited<ReturnType<typeof mountConsentRuntime>>['ctx']) {
  const main = await ctx.agents.create({
    sessionId: SessionId(`consent-main-${randomUUID()}`),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  const child = await main.agent.ctx.agents.create({
    sessionId: SessionId(`consent-child-${randomUUID()}`),
    meta: {
      origin: 'subagent',
      parentSession: main.agent.session.id,
      delegationDepth: 1,
    },
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  return { main, child }
}

async function executeConsent(
  ctx: Awaited<ReturnType<typeof mountConsentRuntime>>['ctx'],
  agent: Agent | undefined,
  args: unknown,
) {
  return ctx.tools.execute({
    callId: CallId(`learning-consent-${randomUUID()}`),
    name: 'tianwen_learning_consent',
    arguments: args,
    ...(agent === undefined ? {} : { agent }),
    signal: new AbortController().signal,
  })
}

async function executeLearningStatus(
  ctx: Awaited<ReturnType<typeof mountConsentRuntime>>['ctx'],
  agent: Agent | undefined,
  signal = new AbortController().signal,
) {
  return ctx.tools.execute({
    callId: CallId(`learning-status-${randomUUID()}`),
    name: 'tianwen_learning_status',
    arguments: {},
    ...(agent === undefined ? {} : { agent }),
    signal,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen main-chat learning consent tool', () => {
  it('reports bounded read-only learning status only for a main Session', async () => {
    const mounted = await mountConsentRuntime('learning-status')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const mainSchema = mounted.ctx.tools.schemas(main.agent).find(tool =>
        tool.name === 'tianwen_learning_status')
      expect(mainSchema).toMatchObject({
        name: 'tianwen_learning_status',
        parameters: { type: 'object', properties: {} },
        description: expect.stringContaining('current learning history'),
      })
      expect(mounted.ctx.tools.schemas(child.agent).some(tool =>
        tool.name === 'tianwen_learning_status')).toBe(false)
      const beforeConsent = mounted.ctx.tianwenEvolution.getLearningAnalysisConsent()
      const beforeRequests = mounted.adapter.requests.length
      await expect(executeLearningStatus(mounted.ctx, child.agent)).resolves
        .toMatchObject({ isError: true })
      await expect(executeLearningStatus(mounted.ctx, main.agent)).resolves
        .toMatchObject({
          isError: false,
          value: {
            currentSession: { hasFrozenGovernedBinding: false },
            history: { skillBoundRuns: 0, recordedOutcomes: 0, analyses: 0 },
            nativeSkills: { available: false, skills: [] },
            learningSources: { configured: 0, eligible: 0, skills: [], available: false },
          },
        })
      expect(mounted.ctx.tianwenEvolution.getLearningAnalysisConsent()).toBe(beforeConsent)
      expect(mounted.adapter.requests).toHaveLength(beforeRequests)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('installs the strict action-only tool for the main Agent and not its subagent', async () => {
    const mounted = await mountConsentRuntime('installation')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const mainSchema = mounted.ctx.tools.schemas(main.agent).find(tool =>
        tool.name === 'tianwen_learning_consent')
      expect(mainSchema).toEqual({
        name: 'tianwen_learning_consent',
        description: expect.stringContaining(LEARNING_CONSENT_NOTICE_TEXT),
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['enable', 'disable', 'status'],
            },
          },
          required: ['action'],
        },
      })
      expect(mounted.ctx.tools.schemas(child.agent).some(tool =>
        tool.name === 'tianwen_learning_consent')).toBe(false)
      expect(JSON.stringify(mainSchema)).not.toContain('sessionId')
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('uses the executing main Agent identity and rejects absent, child, or invalid arguments', async () => {
    const mounted = await mountConsentRuntime('identity')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const definition = mounted.ctx.tools.get('tianwen_learning_consent', main.agent)
      expect(definition).toBeDefined()
      await expect(definition!.execute(
        { action: 'status' },
        { agent: undefined } as never,
      )).rejects.toThrow(/only in a main Session/u)
      await expect(definition!.execute(
        { action: 'status' },
        { agent: child.agent } as never,
      )).rejects.toThrow(/only in a main Session/u)

      for (const args of [
        {},
        { action: 'other' },
        { action: 'status', sessionId: String(main.agent.session.id) },
        { action: 'enable', note: 'private' },
      ]) {
        const result = await executeConsent(mounted.ctx, main.agent, args)
        expect(result).toMatchObject({ isError: true })
      }
      expect(mounted.ctx.tianwenEvolution.getLearningAnalysisConsent())
        .toBeUndefined()
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('treats a parentSession-only Agent as a child in installation, execution, and notice recovery', async () => {
    const mounted = await mountConsentRuntime('parent-only', [
      textResponse('Notice acknowledged.'),
    ])
    const main = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-main-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    const child = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-parent-only-${randomUUID()}`),
      meta: { parentSession: main.agent.session.id },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      expect(child.agent.session.header.parentSession)
        .toBe(main.agent.session.id)
      expect(child.agent.session.header.origin).toBeUndefined()
      expect(mounted.ctx.tools.schemas(child.agent).some(tool =>
        tool.name === 'tianwen_learning_consent')).toBe(false)

      const definition = mounted.ctx.tools.get(
        'tianwen_learning_consent',
        main.agent,
      )
      await expect(definition!.execute(
        { action: 'status' },
        { agent: child.agent } as never,
      )).rejects.toThrow(/only in a main Session/u)

      await mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(child.agent.session.id))
      await main.agent.whenIdle()
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v2',
      )).toMatchObject({
        state: 'delivered',
        mainSessionId: String(main.agent.session.id),
      })
      expect(child.agent.session.events.some(event =>
        event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID))
        .toBe(false)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('increments profile consent only on state changes and returns privacy-safe status', async () => {
    const mounted = await mountConsentRuntime('actions')
    const main = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-main-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const initial = await executeConsent(mounted.ctx, main.agent, { action: 'status' })
      expect(initial).toMatchObject({
        isError: false,
        value: {
          policyVersion: 'tianwen-auto-analysis.v2',
          enabled: false,
          revision: 0,
        },
      })
      const enabled = await executeConsent(mounted.ctx, main.agent, { action: 'enable' })
      expect(enabled).toMatchObject({
        isError: false,
        value: {
          policyVersion: 'tianwen-auto-analysis.v2',
          enabled: true,
          revision: 1,
        },
      })
      const enabledReplay = await executeConsent(mounted.ctx, main.agent, { action: 'enable' })
      expect(enabledReplay).toMatchObject({
        isError: false,
        value: { enabled: true, revision: 1 },
      })
      const disabled = await executeConsent(mounted.ctx, main.agent, { action: 'disable' })
      expect(disabled).toMatchObject({
        isError: false,
        value: { enabled: false, revision: 2 },
      })
      const serialized = JSON.stringify([initial.value, enabled.value, disabled.value])
      expect(serialized).not.toContain('note')
      expect(serialized).not.toContain('scope')
      expect(serialized).not.toMatch(/[A-Z]:\//u)
    } finally {
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('keeps feedback-only consent readable and upgrades it once through the main tool', async () => {
    const mounted = await mountConsentRuntime('policy-upgrade')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({
        revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v1',
      })
      expect(await executeConsent(mounted.ctx, main.agent, { action: 'status' }))
        .toMatchObject({ value: { enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v1' } })
      expect(await executeConsent(mounted.ctx, main.agent, { action: 'enable' }))
        .toMatchObject({ value: { enabled: true, revision: 2, policyVersion: 'tianwen-auto-analysis.v2' } })
      expect(await executeConsent(mounted.ctx, main.agent, { action: 'enable' }))
        .toMatchObject({ value: { enabled: true, revision: 2, policyVersion: 'tianwen-auto-analysis.v2' } })
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('removes scoped tools on service unload and reinstalls once after reload', async () => {
    const mounted = await mountConsentRuntime('reload')
    const main = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-main-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      expect(mounted.ctx.tools.schemas(main.agent).filter(tool =>
        tool.name === 'tianwen_learning_consent')).toHaveLength(1)
      await mounted.consentFiber.dispose()
      expect(mounted.ctx.tools.schemas(main.agent).some(tool =>
        tool.name === 'tianwen_learning_consent')).toBe(false)

      const reloaded = mounted.ctx.plugin(TianwenLearningConsentAgentService)
      await reloaded
      expect(mounted.ctx.tools.schemas(main.agent).filter(tool =>
        tool.name === 'tianwen_learning_consent')).toHaveLength(1)
      await reloaded.dispose()
    } finally {
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('delivers the source-disclosing tool-disabled notice once to the exact main parent of child feedback', async () => {
    const mounted = await mountConsentRuntime('notice', [
      toolCallResponse('notice-tool-call', 'notice_probe', {}),
      textResponse('Notice acknowledged.'),
    ])
    let toolRuns = 0
    const disposeProbe = mounted.ctx.tools.register(defineTool({
      name: 'notice_probe',
      description: 'Must stay disabled during the notice.',
      parameters: {},
      output: {
        schema: { type: 'string', const: 'ran' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        toolRuns += 1
        return 'ran'
      },
    }))
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      await mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(child.agent.session.id))
      await main.agent.whenIdle()

      expect(toolRuns).toBe(0)
      expect(mounted.adapter.requests).toHaveLength(2)
      const noticeEvent = main.agent.session.events.find(event =>
        event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID)
      expect(noticeEvent).toBeDefined()
      if (noticeEvent?.type !== 'user/message') throw new Error('notice missing')
      expect(noticeEvent.data.content).toEqual([{
        type: 'text',
        text: LEARNING_CONSENT_NOTICE_TEXT,
      }])
      expect(LEARNING_CONSENT_NOTICE_TEXT).toContain('at most two failed task packets/submissions and one successful counterexample')
      expect(LEARNING_CONSENT_NOTICE_TEXT).toContain('frozen Skill text')
      expect(LEARNING_CONSENT_NOTICE_TEXT).not.toContain('PRIVATE CORRECTION')
      expect(child.agent.session.events.some(event =>
        event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID))
        .toBe(false)
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v2',
      )).toMatchObject({
        state: 'delivered',
        mainSessionId: String(main.agent.session.id),
        noticeSourceMessageId: LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID,
      })

      await mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(child.agent.session.id))
      expect(mounted.adapter.requests).toHaveLength(2)
    } finally {
      await child.dispose()
      await main.dispose()
      disposeProbe()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('recovers delivery-after-ack failure across restart without running the notice twice', async () => {
    const root = tempRoot('notice-restart')
    const first = await mountConsentRuntimeAt(root, [textResponse('Notice acknowledged.')])
    const { main, child } = await createMainAndChild(first.ctx)
    const mainSessionId = main.agent.session.id
    const acknowledge = first.ctx.tianwenEvolution
      .recordLearningConsentNoticeDelivered.bind(first.ctx.tianwenEvolution)
    let failAcknowledgement = true
    first.ctx.tianwenEvolution.recordLearningConsentNoticeDelivered = input => {
      if (failAcknowledgement) {
        failAcknowledgement = false
        throw new Error('forced acknowledgement failure')
      }
      return acknowledge(input)
    }
    await expect(first.ctx.tianwenLearningConsentAgent
      .observeFeedbackWithoutConsent(String(child.agent.session.id)))
      .rejects.toThrow('forced acknowledgement failure')
    expect(first.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
      'tianwen-auto-analysis.v2',
    )?.state).toBe('pending')
    expect(first.adapter.requests).toHaveLength(1)
    await child.dispose()
    await main.dispose()
    await first.ctx.fiber.dispose()

    const recovered = await mountConsentRuntimeAt(root)
    const resumed = await recovered.ctx.agents.resume({
      resumeSessionId: mainSessionId,
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      await expect.poll(() => recovered.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v2')?.state)
        .toBe('delivered')
      expect(recovered.adapter.requests).toHaveLength(0)
      expect(resumed.agent.session.events.filter(event =>
        event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID))
        .toHaveLength(1)
    } finally {
      await resumed.dispose()
      await recovered.ctx.fiber.dispose()
    }
  })

  it('keeps an offline intent bound to its original main and fails closed without provable lineage', async () => {
    const mounted = await mountConsentRuntime('offline', [textResponse('Recovered notice.')])
    const { main, child } = await createMainAndChild(mounted.ctx)
    const mainSessionId = main.agent.session.id
    const childSessionId = child.agent.session.id
    const offline = vi.spyOn(mounted.ctx.agents, 'get').mockReturnValue(undefined)

    await mounted.ctx.tianwenLearningConsentAgent
      .observeFeedbackWithoutConsent(String(childSessionId))
    expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
      'tianwen-auto-analysis.v2',
    )).toMatchObject({
      state: 'pending',
      mainSessionId: String(mainSessionId),
    })
    expect(mounted.adapter.requests).toHaveLength(0)

    offline.mockRestore()
    try {
      await executeConsent(mounted.ctx, main.agent, { action: 'status' })
      await expect.poll(() => mounted.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v2')?.state)
        .toBe('delivered')
      expect(mounted.adapter.requests).toHaveLength(1)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }

    const missing = await mountConsentRuntime('missing-lineage')
    const orphan = await missing.ctx.agents.create({
      sessionId: SessionId(`consent-orphan-${randomUUID()}`),
      meta: {
        origin: 'subagent',
        parentSession: SessionId(`missing-parent-${randomUUID()}`),
        delegationDepth: 1,
      },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      await expect(missing.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(orphan.agent.session.id)))
        .resolves.toBe(false)
      expect(missing.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v2',
      )).toBeUndefined()
      expect(missing.adapter.requests).toHaveLength(0)
    } finally {
      await orphan.dispose()
      await missing.ctx.fiber.dispose()
    }
  })

  it('fails a parentless subagent orphan closed', async () => {
    const mounted = await mountConsentRuntime('parentless-orphan')
    const orphan = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-parentless-orphan-${randomUUID()}`),
      meta: {
        origin: 'subagent',
        delegationDepth: 1,
      },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      expect(mounted.ctx.tools.schemas(orphan.agent).some(tool =>
        tool.name === 'tianwen_learning_consent')).toBe(false)
      await expect(mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(orphan.agent.session.id)))
        .resolves.toBe(false)
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v2',
      )).toBeUndefined()
    } finally {
      await orphan.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('rereads an exact committed intent after an append error and rejects a conflicting one', async () => {
    const exact = await mountConsentRuntime('intent-append-reread')
    const exactLineage = await createMainAndChild(exact.ctx)
    const exactRecord = exact.ctx.tianwenEvolution
      .recordLearningConsentNoticeIntent.bind(exact.ctx.tianwenEvolution)
    vi.spyOn(exact.ctx.agents, 'get').mockReturnValue(undefined)
    vi.spyOn(exact.ctx.tianwenEvolution, 'recordLearningConsentNoticeIntent')
      .mockImplementationOnce(input => {
        exactRecord(input)
        throw new Error('forced error after exact intent append')
      })
    try {
      await expect(exact.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(exactLineage.child.agent.session.id)))
        .resolves.toBe(true)
      expect(exact.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v2',
      )).toMatchObject({
        state: 'pending',
        mainSessionId: String(exactLineage.main.agent.session.id),
      })
    } finally {
      await exactLineage.child.dispose()
      await exactLineage.main.dispose()
      await exact.ctx.fiber.dispose()
    }

    vi.restoreAllMocks()
    const conflict = await mountConsentRuntime('intent-append-conflict')
    const first = await createMainAndChild(conflict.ctx)
    const second = await createMainAndChild(conflict.ctx)
    const conflictingRecord = conflict.ctx.tianwenEvolution
      .recordLearningConsentNoticeIntent.bind(conflict.ctx.tianwenEvolution)
    vi.spyOn(conflict.ctx.tianwenEvolution, 'recordLearningConsentNoticeIntent')
      .mockImplementationOnce(input => {
        conflictingRecord({
          ...input,
          mainSessionId: String(second.main.agent.session.id),
        })
        throw new Error('forced conflicting intent append')
      })
    try {
      await expect(conflict.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(first.child.agent.session.id)))
        .rejects.toThrow('forced conflicting intent append')
      expect(conflict.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v2',
      )).toMatchObject({
        state: 'pending',
        mainSessionId: String(second.main.agent.session.id),
      })
    } finally {
      await second.child.dispose()
      await second.main.dispose()
      await first.child.dispose()
      await first.main.dispose()
      await conflict.ctx.fiber.dispose()
    }
  })

  it('admits concurrent lineages in call-entry order and records one notice lifecycle across reload', async () => {
    const mounted = await mountConsentRuntime('concurrent-admission', [
      textResponse('Notice acknowledged.'),
    ])
    const first = await createMainAndChild(mounted.ctx)
    const second = await createMainAndChild(mounted.ctx)
    const gate = deferred()
    const inspected: string[] = []
    const inspect = mounted.ctx.sessionPersistence.inspect
      .bind(mounted.ctx.sessionPersistence)
    vi.spyOn(mounted.ctx.sessionPersistence, 'inspect')
      .mockImplementation(async sessionId => {
        const value = String(sessionId)
        inspected.push(value)
        if (value === String(first.child.agent.session.id)) await gate.promise
        return inspect(sessionId)
      })
    try {
      const firstObservation = mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(first.child.agent.session.id))
      await nextTurn()
      const secondObservation = mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(second.child.agent.session.id))
      await nextTurn()

      expect(inspected).not.toContain(String(second.child.agent.session.id))
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v2',
      )).toBeUndefined()

      gate.resolve()
      await expect(Promise.all([firstObservation, secondObservation]))
        .resolves.toEqual([true, true])
      await first.main.agent.whenIdle()
      await second.main.agent.whenIdle()
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v2',
      )).toMatchObject({
        state: 'delivered',
        mainSessionId: String(first.main.agent.session.id),
      })
      expect(mounted.adapter.requests).toHaveLength(1)
      const ledger = readFileSync(
        join(mounted.root, 'evolution', 'ledger.jsonl'),
        'utf8',
      ).trim().split('\n').map(line => JSON.parse(line) as { readonly type: string })
      expect(ledger.filter(event =>
        event.type === 'learning-consent-notice-intent-recorded'))
        .toHaveLength(1)
      expect(ledger.filter(event =>
        event.type === 'learning-consent-notice-delivered'))
        .toHaveLength(1)

      await mounted.consentFiber.dispose()
      const reloaded = mounted.ctx.plugin(TianwenLearningConsentAgentService)
      await reloaded
      await expect(mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(second.child.agent.session.id)))
        .resolves.toBe(true)
      expect(mounted.adapter.requests).toHaveLength(1)
      await reloaded.dispose()
    } finally {
      gate.resolve()
      await second.child.dispose()
      await second.main.dispose()
      await first.child.dispose()
      await first.main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('waits an admitted lineage choice during unload and rejects later admissions', async () => {
    const mounted = await mountConsentRuntime('admission-unload', [
      textResponse('Notice acknowledged.'),
    ])
    const { main, child } = await createMainAndChild(mounted.ctx)
    const service = mounted.ctx.tianwenLearningConsentAgent
    const gate = deferred()
    const inspect = mounted.ctx.sessionPersistence.inspect
      .bind(mounted.ctx.sessionPersistence)
    vi.spyOn(mounted.ctx.sessionPersistence, 'inspect')
      .mockImplementation(async sessionId => {
        if (String(sessionId) === String(child.agent.session.id)) {
          await gate.promise
        }
        return inspect(sessionId)
      })
    try {
      const observation = service
        .observeFeedbackWithoutConsent(String(child.agent.session.id))
      await nextTurn()
      let disposed = false
      const disposal = mounted.consentFiber.dispose().then(() => {
        disposed = true
      })
      await nextTurn()
      expect(disposed).toBe(false)
      gate.resolve()
      await expect(observation).resolves.toBe(true)
      await disposal
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v2',
      )).toMatchObject({ mainSessionId: String(main.agent.session.id) })
      await expect(service
        .observeFeedbackWithoutConsent(String(child.agent.session.id)))
        .resolves.toBe(false)
    } finally {
      gate.resolve()
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })
})
