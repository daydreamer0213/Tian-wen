import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
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

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen main-chat learning consent tool', () => {
  it('installs the strict action-only tool for the main Agent and not its subagent', async () => {
    const mounted = await mountConsentRuntime('installation')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const mainSchema = mounted.ctx.tools.schemas(main.agent).find(tool =>
        tool.name === 'tianwen_learning_consent')
      expect(mainSchema).toEqual({
        name: 'tianwen_learning_consent',
        description: 'Enable, disable, or inspect Tianwen automatic feedback analysis for this profile.',
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
          policyVersion: 'tianwen-auto-analysis.v1',
          enabled: false,
          revision: 0,
        },
      })
      const enabled = await executeConsent(mounted.ctx, main.agent, { action: 'enable' })
      expect(enabled).toMatchObject({
        isError: false,
        value: {
          policyVersion: 'tianwen-auto-analysis.v1',
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

  it('delivers the five-fact tool-disabled notice once to the exact main parent of child feedback', async () => {
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
      expect(LEARNING_CONSENT_NOTICE_TEXT.split('\n')).toHaveLength(5)
      expect(LEARNING_CONSENT_NOTICE_TEXT).not.toContain('PRIVATE CORRECTION')
      expect(child.agent.session.events.some(event =>
        event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID))
        .toBe(false)
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
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
      'tianwen-auto-analysis.v1',
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
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v1')?.state)
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
      'tianwen-auto-analysis.v1',
    )).toMatchObject({
      state: 'pending',
      mainSessionId: String(mainSessionId),
    })
    expect(mounted.adapter.requests).toHaveLength(0)

    offline.mockRestore()
    try {
      await executeConsent(mounted.ctx, main.agent, { action: 'status' })
      await expect.poll(() => mounted.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v1')?.state)
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
        'tianwen-auto-analysis.v1',
      )).toBeUndefined()
      expect(missing.adapter.requests).toHaveLength(0)
    } finally {
      await orphan.dispose()
      await missing.ctx.fiber.dispose()
    }
  })
})
