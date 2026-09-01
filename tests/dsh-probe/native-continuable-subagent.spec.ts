import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { SubagentProvider } from '@deepseek-ai/dsh-subagent'
import {
  Context,
  ScriptedAdapter,
  SessionId,
  mountAgentLoopTestDependencies,
  textResponse,
} from '@tianwen/dsh-compat'

const FIXTURE_BASE = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-dsh-probe',
  'native-continuable-subagent',
)

type ProjectionDefinition = {
  readonly key: string
  init(): unknown
  apply(state: unknown, event: unknown): unknown
  readonly wire: { view(state: unknown): unknown }
}

function projectionRegistry() {
  const definitions: ProjectionDefinition[] = []
  const valuesFor = (events: readonly unknown[]) => Object.fromEntries(definitions.map(definition => {
    let state = definition.init()
    for (const event of events) state = definition.apply(state, event)
    return [definition.key, definition.wire.view(state)]
  }))

  return {
    register(definition: ProjectionDefinition): void {
      definitions.push(definition)
    },
    snapshot(session: { readonly events: readonly unknown[] }) {
      return { values: valuesFor(session.events) }
    },
    restore(_base: unknown, events: readonly unknown[], _from: number) {
      return { snapshot: { values: valuesFor(events) } }
    },
  }
}

function delegatedSandboxPolicy() {
  return {
    overrideOf(session: { readonly events: readonly { readonly type: string, readonly data: unknown }[] }) {
      const event = session.events.findLast(item => item.type === 'sandbox/mode')
      return (event?.data as { readonly mode?: unknown } | undefined)?.mode
    },
  }
}

const spawnProvider: SubagentProvider = {
  name: 'spawn',
  inheritsParentContext: false,
  capabilities: {
    outputSchema: false,
    depthLimit: false,
    toolFilter: false,
    persona: false,
  },
  async start() {
    throw new Error('continuable probe never uses the one-shot provider path')
  },
  async prepareContinuable() {
    return {}
  },
}

async function mountHarness(script: ConstructorParameters<typeof ScriptedAdapter>[0]) {
  mkdirSync(FIXTURE_BASE, { recursive: true })
  const root = mkdtempSync(join(FIXTURE_BASE, 'sessions-'))
  const ctx = new Context()
  ctx.provide('sessionProjections', projectionRegistry())
  ctx.provide('sandboxPolicy', delegatedSandboxPolicy())
  ctx.provide('approval', {})
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  await ctx.plugin(SubagentRuntime)
  const adapter = new ScriptedAdapter(script)
  ctx.llm.registerAdapter(['tianwen-probe'], adapter)
  ctx.subagents.registerProvider(spawnProvider)
  const parent = (await ctx.agents.create({
    sessionId: SessionId('native-continuable-parent'),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })).agent

  return {
    root,
    ctx,
    adapter,
    parent,
    async dispose() {
      await ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    },
  }
}

function settlementNotices(events: readonly { readonly type: string, readonly data: unknown }[]) {
  return events.filter(event => event.type === 'user/message'
    && (event.data as { readonly source?: { readonly kind?: unknown } }).source?.kind === 'subagent-settled')
}

describe('native continuable DSH subagents', () => {
  it('persists immutable delegated policy snapshots and catalogs continuable children', async () => {
    const harness = await mountHarness([
      textResponse('first child finished'),
      textResponse('first parent notice'),
      textResponse('second child finished'),
      textResponse('second parent notice'),
    ])

    try {
      harness.parent.session.append('sandbox/mode', {
        mode: 'workspace-write',
        source: 'user',
      })
      const first = await harness.ctx.subagents.startContinuable({
        provider: 'spawn',
        label: 'Tianwen contract child',
        request: {
          parent: harness.parent,
          prompt: [{ type: 'text', text: 'Return one short status.' }],
        },
        signal: AbortSignal.timeout(10_000),
      })
      await vi.waitFor(async () => {
        expect((await harness.ctx.sessionPersistence.inspect(first.childId)).events
          .some(event => event.type === 'turn/end')).toBe(true)
      })

      const firstChild = await harness.ctx.sessionPersistence.inspect(first.childId)
      expect(firstChild.events.filter(event => event.type === 'subagent/descriptor'))
        .toMatchObject([{ data: { mode: 'continuable', provider: 'spawn' } }])
      expect(firstChild.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'sandbox/mode',
          data: { mode: 'workspace-write', source: 'delegation' },
        }),
        expect.objectContaining({
          type: 'approval/policy',
          data: { policy: 'never', source: 'delegation' },
        }),
      ]))
      const entries = await harness.ctx.subagents.listChildren(
        harness.parent.session.id,
        AbortSignal.timeout(10_000),
      )
      expect(entries).toContainEqual(expect.objectContaining({
        kind: 'child',
        id: first.childId,
        mode: 'continuable',
      }))
      expect(entries).not.toContainEqual(expect.objectContaining({
        kind: 'diagnostic',
        reason: 'corrupt',
      }))

      harness.parent.session.append('sandbox/mode', {
        mode: 'danger-full-access',
        source: 'user',
      })
      const second = await harness.ctx.subagents.startContinuable({
        provider: 'spawn',
        label: 'Tianwen expanded contract child',
        request: {
          parent: harness.parent,
          prompt: [{ type: 'text', text: 'Return one short status.' }],
        },
        signal: AbortSignal.timeout(10_000),
      })
      await vi.waitFor(async () => {
        expect((await harness.ctx.sessionPersistence.inspect(second.childId)).events
          .some(event => event.type === 'turn/end')).toBe(true)
      })

      expect((await harness.ctx.sessionPersistence.inspect(first.childId)).events).toEqual(firstChild.events)
      expect((await harness.ctx.sessionPersistence.inspect(second.childId)).events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'sandbox/mode',
          data: { mode: 'danger-full-access', source: 'delegation' },
        }),
      ]))
    } finally {
      await harness.dispose()
    }
  })

  it('cold-resumes a persisted child and settles each activation into its exact live parent once', async () => {
    const harness = await mountHarness([
      textResponse('initial child result'),
      textResponse('initial parent notice'),
      textResponse('resumed child result'),
      textResponse('resumed parent notice'),
    ])

    try {
      const started = await harness.ctx.subagents.startContinuable({
        provider: 'spawn',
        label: 'Tianwen cold resume child',
        request: {
          parent: harness.parent,
          prompt: [{ type: 'text', text: 'Return one short status.' }],
        },
        signal: AbortSignal.timeout(10_000),
      })
      await vi.waitFor(async () => {
        expect(settlementNotices(harness.parent.session.events)).toHaveLength(1)
        expect(harness.ctx.agents.get(started.childId)).toBeUndefined()
      })

      const noticesBeforeResume = settlementNotices(harness.parent.session.events)
      await harness.ctx.subagents.followup(
        harness.parent,
        started.childId,
        [{ type: 'text', text: 'Give one more short status.' }],
        {
          source: {
            kind: 'coordinator',
            form: 'relay',
            senderSessionId: harness.parent.session.id,
          },
          signal: AbortSignal.timeout(10_000),
        },
      )
      await vi.waitFor(async () => {
        expect(settlementNotices(harness.parent.session.events)).toHaveLength(2)
        expect(harness.ctx.agents.get(started.childId)).toBeUndefined()
      })

      const child = await harness.ctx.sessionPersistence.inspect(started.childId)
      expect(child.events.filter(event => event.type === 'user/message')).toEqual(expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            source: expect.objectContaining({
              kind: 'coordinator',
              senderSessionId: harness.parent.session.id,
            }),
          }),
        }),
      ]))
      expect(settlementNotices(harness.parent.session.events).slice(noticesBeforeResume.length)).toHaveLength(1)
    } finally {
      await harness.dispose()
    }
  })
})
