import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

type ClientElement = {
  readonly type: unknown
  readonly key: unknown
  readonly props: Record<string, unknown>
}

type SessionListState = {
  readonly current: string | undefined
  readonly byId: Record<string, Record<string, unknown>>
}

function isElement(value: unknown): value is ClientElement {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value
}

class ClientComponentRuntime {
  private readonly hooks = new Map<Function, unknown[]>()
  private readonly effectCleanups = new Set<() => void>()
  private currentHooks: unknown[] | undefined
  private cursor = 0

  readonly react = {
    useCallback: <T>(callback: T): T => {
      this.cursor += 1
      return callback
    },
    useEffect: (effect: () => void | (() => void), dependencies?: readonly unknown[]): void => {
      const hooks = this.requireHooks()
      const index = this.cursor++
      const previous = hooks[index] as {
        readonly dependencies: readonly unknown[] | undefined
        readonly cleanup: (() => void) | undefined
      } | undefined
      const changed = dependencies === undefined || previous === undefined ||
        dependencies.length !== previous.dependencies?.length ||
        dependencies.some((dependency, dependencyIndex) =>
          dependency !== previous.dependencies?.[dependencyIndex])
      if (!changed) return
      previous?.cleanup?.()
      if (previous?.cleanup !== undefined) this.effectCleanups.delete(previous.cleanup)
      const cleanup = effect()
      hooks[index] = { dependencies, cleanup }
      if (cleanup !== undefined) this.effectCleanups.add(cleanup)
    },
    useRef: <T>(initial: T): { current: T } => {
      const hooks = this.requireHooks()
      const index = this.cursor++
      if (!(index in hooks)) hooks[index] = { current: initial }
      return hooks[index] as { current: T }
    },
    useState: <T>(initial: T | (() => T)): [T, (next: T | ((current: T) => T)) => void] => {
      const hooks = this.requireHooks()
      const index = this.cursor++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? (initial as () => T)() : initial
      return [hooks[index] as T, next => {
        hooks[index] = typeof next === 'function'
          ? (next as (current: T) => T)(hooks[index] as T)
          : next
      }]
    },
    useSyncExternalStore: <T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T): T => {
      const hooks = this.requireHooks()
      const index = this.cursor++
      if (!(index in hooks)) hooks[index] = subscribe(() => undefined)
      return getSnapshot()
    },
  }

  readonly jsxRuntime = {
    Fragment: Symbol('Fragment'),
    jsx: (type: unknown, props: Record<string, unknown>, key?: unknown): ClientElement => ({
      type,
      key: key ?? null,
      props,
    }),
    jsxs: (type: unknown, props: Record<string, unknown>, key?: unknown): ClientElement => ({
      type,
      key: key ?? null,
      props,
    }),
  }

  render(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => this.render(item))
    if (!isElement(value)) return value
    if (typeof value.type === 'function') {
      const previousHooks = this.currentHooks
      const previousCursor = this.cursor
      const hooks = this.hooks.get(value.type) ?? []
      this.hooks.set(value.type, hooks)
      this.currentHooks = hooks
      this.cursor = 0
      const rendered = this.render(value.type(value.props))
      this.currentHooks = previousHooks
      this.cursor = previousCursor
      return rendered
    }
    return {
      ...value,
      props: {
        ...value.props,
        children: this.render(value.props.children),
      },
    }
  }

  unmount(): void {
    for (const cleanup of this.effectCleanups) cleanup()
    this.effectCleanups.clear()
  }

  private requireHooks(): unknown[] {
    if (this.currentHooks === undefined) throw new Error('hook used outside a component')
    return this.currentHooks
  }
}

function elements(value: unknown): ClientElement[] {
  if (Array.isArray(value)) return value.flatMap(elements)
  if (!isElement(value)) return []
  return [value, ...elements(value.props.children)]
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (isElement(value)) return text(value.props.children)
  if (value === null || value === undefined || value === false) return ''
  return String(value)
}

function findElement(
  tree: unknown,
  predicate: (element: ClientElement) => boolean,
): ClientElement {
  const found = elements(tree).find(predicate)
  if (found === undefined) throw new Error('expected client element was not rendered')
  return found
}

function findButton(tree: unknown, label: string): ClientElement {
  return findElement(tree, element => element.type === 'button' && text(element) === label)
}

function createSessionList(initial: SessionListState) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next: SessionListState) {
      state = next
      for (const listener of listeners) listener()
    },
  }
}

type TestLocaleId = 'zh' | 'en'

class TestLocale {
  private readonly dictionaries = new Map<string, Map<TestLocaleId, Readonly<Record<string, string>>>>()
  private readonly listeners = new Set<() => void>()
  private snapshot: { readonly active: TestLocaleId, readonly revision: number }

  constructor(active: TestLocaleId) {
    this.snapshot = { active, revision: 0 }
  }

  register(
    namespace: string,
    locale: string,
    dictionary: Readonly<Record<string, string>>,
  ): () => void {
    if (locale !== 'zh' && locale !== 'en') throw new Error(`unsupported test locale: ${locale}`)
    const namespaces = this.dictionaries.get(namespace) ?? new Map()
    namespaces.set(locale, dictionary)
    this.dictionaries.set(namespace, namespaces)
    this.publish(this.snapshot.active)
    return () => {
      if (namespaces.get(locale) !== dictionary) return
      namespaces.delete(locale)
      this.publish(this.snapshot.active)
    }
  }

  bind(namespace: string) {
    return (key: string, params?: Readonly<Record<string, string | number>>): string => {
      const dictionaries = this.dictionaries.get(namespace)
      const template = dictionaries?.get(this.snapshot.active)?.[key]
        ?? dictionaries?.get('en')?.[key]
        ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/gu, (match, name: string) =>
        name in params ? String(params[name]) : match)
    }
  }

  getSnapshot(): { readonly active: TestLocaleId, readonly revision: number } {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get subscriberCount(): number {
    return this.listeners.size
  }

  set(active: TestLocaleId): void {
    if (active === this.snapshot.active) return
    this.publish(active)
  }

  private publish(active: TestLocaleId): void {
    this.snapshot = { active, revision: this.snapshot.revision + 1 }
    for (const listener of this.listeners) listener()
  }
}

const unboundStatus = {
  schemaVersion: 'tianwen.long-goal-status.v1',
  goal: {
    id: 'tianwen-long-goal-1', objective: 'Ship Learn Loop', phase: 'active',
    completedTasks: 0, totalTasks: 1,
  },
  tasks: [{ id: 'task-1', objective: 'Open the UI', phase: 'pending', execution: null }],
  currentTaskId: 'task-1',
  runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
} as const

const coldStatus = {
  ...unboundStatus,
  tasks: [{
    ...unboundStatus.tasks[0],
    phase: 'active',
    execution: { goalId: 'goal-1', sessionId: 'session-1' },
  }],
} as const

const statusV2 = {
  schemaVersion: 'tianwen.long-goal-status.v2',
  goal: {
    id: 'goal-first-1',
    objective: 'Ship goal-first Learn Loop',
    context: 'Keep the existing overlay',
    successCriteria: 'Users author one Goal',
    phase: 'active',
    revision: 4,
    completedTasks: 0,
    abandonedTasks: 0,
    totalTasks: 1,
  },
  planner: { sessionId: 'planner-session', phase: 'ready', planRevision: 1 },
  guidance: [],
  tasks: [{
    id: 'task-v2-1',
    objective: 'Implement the Web flow',
    phase: 'active',
    execution: { goalId: 'goal-v2-1', sessionId: 'task-session' },
    resolution: null,
  }],
  currentTaskId: 'task-v2-1',
  runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
} as const

const planningStatus = {
  ...statusV2,
  goal: {
    ...statusV2.goal,
    phase: 'planning',
    revision: 1,
    completedTasks: 0,
    abandonedTasks: 0,
    totalTasks: 0,
  },
  planner: { ...statusV2.planner, phase: 'unplanned', planRevision: 0 },
  tasks: [],
  currentTaskId: null,
} as const

const continuousStatus = {
  ...statusV2,
  schemaVersion: 'tianwen.long-goal-status.v3',
  goal: {
    ...statusV2.goal,
    id: 'continuous-goal-1',
    objective: 'Ship continuous Goal history',
    completedTasks: 1,
    totalTasks: 3,
  },
  planner: { ...statusV2.planner, sessionId: 'continuous-planner' },
  tasks: [{
    id: 'continuous-complete', objective: 'Inspect the existing flow', phase: 'complete',
    execution: { goalId: 'goal-complete', sessionId: 'session-complete' }, resolution: null,
  }, statusV2.tasks[0], {
    id: 'continuous-next', objective: 'Verify compatibility', phase: 'pending',
    execution: null, resolution: null,
  }],
  control: { sessionId: 'control-session', autoProgress: 'paused' },
} as const

const summaryV1 = {
  id: unboundStatus.goal.id,
  objective: unboundStatus.goal.objective,
  phase: unboundStatus.goal.phase,
  completedTasks: 0,
  totalTasks: 1,
  currentTaskId: 'task-1',
  updatedAt: 1,
} as const

function sessionRow(input: {
  readonly sessionId: string
  readonly cwd?: string
  readonly running?: boolean
  readonly goalId?: string
  readonly goalPhase?: 'active' | 'paused' | 'blocked' | 'complete'
}): Record<string, unknown> {
  return {
    id: input.sessionId,
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    running: input.running ?? false,
    ...(input.goalId === undefined ? {} : {
      projectionValues: {
        goal: {
          goal: {
            id: input.goalId,
            revision: 1,
            objective: 'Open the UI',
            phase: input.goalPhase ?? 'active',
            maxGoalRounds: 3,
          },
          roundsStarted: 0,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    }),
  }
}

function loadClientModule(input: {
  readonly list: ReturnType<typeof createSessionList>
  readonly rpc: { call: ReturnType<typeof vi.fn> }
  readonly learningAudit?: ReturnType<typeof vi.fn>
  readonly open?: ReturnType<typeof vi.fn>
  readonly locale?: TestLocale
  readonly setTimeout?: typeof setTimeout
}) {
  const runtime = new ClientComponentRuntime()
  let exports: { apply(ctx: unknown): void } | undefined
  let sidebarSlot: ((props: { readonly wide: boolean }) => unknown) | undefined
  let dockSlot: ((props: {
    readonly session: { readonly sessionId: string }
    readonly input: Record<string, never>
  }) => unknown) | undefined
  const open = input.open ?? vi.fn()
  const window = {
    __ModuleLoader__: {
      load(module: { readonly factory: (require: (id: string) => unknown) => unknown }) {
        exports = module.factory(id => {
          if (id === 'react') return runtime.react
          if (id === 'react/jsx-runtime') return runtime.jsxRuntime
          throw new Error(`unexpected client dependency: ${id}`)
        }) as { apply(ctx: unknown): void }
      },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  runInNewContext(
    readFileSync(resolve('packages/tianwen-runtime-bundle/dist/client.js'), 'utf8'),
    {
      window,
      crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
      AbortController, AbortSignal, console, setTimeout: input.setTimeout ?? setTimeout, clearTimeout,
    },
  )
  if (exports === undefined) throw new Error('client module did not register')
  exports.apply({
    connection: { rpc: {
      call: (channel: string, endpoint: string, payload: unknown, options: unknown) =>
        endpoint === 'learning-audit'
          ? (input.learningAudit?.(channel, endpoint, payload, options) ?? Promise.resolve({
              ok: true,
              value: { schemaVersion: 'tianwen.learning-audit.v1', items: [] },
            }))
          : input.rpc.call(channel, endpoint, payload, options),
    } },
    locale: input.locale ?? new TestLocale('en'),
    sessions: { list: input.list, open },
    slots: {
      inject: (_name: string, callback: () => unknown) => callback(),
      register: (options: { readonly name: string }, component: typeof sidebarSlot) => {
        if (options.name === 'sidebar.footer.action') sidebarSlot = component
        if (options.name === 'conversation.input.dock') dockSlot = component as typeof dockSlot
        return () => undefined
      },
    },
  })
  if (sidebarSlot === undefined) throw new Error('sidebar action was not registered')
  return {
    open,
    render: () => runtime.render(sidebarSlot!({ wide: true })),
    hasConversationDock: () => dockSlot !== undefined,
    renderDock: (sessionId: string) => runtime.render(dockSlot?.({ session: { sessionId }, input: {} })),
    unmount: () => runtime.unmount(),
  }
}

async function flushClient(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
}

function openCreateForm(render: () => unknown): unknown {
  let tree = render()
  ;(findElement(tree, element => element.props['aria-label'] === 'Learn Loop').props.onClick as () => void)()
  tree = render()
  ;(findButton(tree, 'Create Goal').props.onClick as () => void)()
  return render()
}

async function createGoal(render: () => unknown): Promise<unknown> {
  let tree = openCreateForm(render)
  const textareas = elements(tree).filter(element => element.type === 'textarea')
  ;(textareas[0]!.props.onChange as Function)({ target: { value: 'Ship goal-first Learn Loop' } })
  ;(textareas[1]!.props.onChange as Function)({ target: { value: 'Keep the existing overlay' } })
  ;(textareas[2]!.props.onChange as Function)({ target: { value: 'Users author one Goal' } })
  tree = render()
  ;(findElement(tree, element => element.type === 'form').props.onSubmit as Function)({
    preventDefault: () => undefined,
  })
  await flushClient()
  return render()
}

async function openListedGoal(render: () => unknown, objective: string): Promise<unknown> {
  let tree = render()
  ;(findElement(tree, element => element.props['aria-label'] === 'Learn Loop').props.onClick as () => void)()
  await flushClient()
  tree = render()
  ;(findElement(tree, element => element.type === 'button' && text(element).includes(objective))
    .props.onClick as () => void)()
  await flushClient()
  return render()
}

describe('Learn Loop compiled DSH client module', () => {
  it('does not query Goal controls from the read-only learning status dock', async () => {
    const rpc = { call: vi.fn(async () => ({ ok: true, value: { goals: [] } })) }
    const client = loadClientModule({
      list: createSessionList({ current: 'control-session', byId: {} }),
      rpc,
    })

    expect(client.hasConversationDock()).toBe(true)
    expect(text(client.renderDock('control-session'))).not.toContain('Goal')
    await flushClient()
    expect(rpc.call).not.toHaveBeenCalled()
    client.unmount()
  })

  it('updates main learning status from live records, handles disconnect, and does not leak across sessions', async () => {
    const callbacks: Array<() => void> = []
    const item = (phase: string) => ({
      analysisId: `analysis:${'a'.repeat(64)}`, ticketId: `ticket:${'b'.repeat(64)}`,
      phase, requestedAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:01:00.000Z',
      evidenceDigests: [], receipts: {}, recovery: null,
    })
    const learningAudit = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { schemaVersion: 'tianwen.learning-audit.v1', items: [item('candidate-ready')] } })
      .mockResolvedValueOnce({ ok: true, value: { schemaVersion: 'tianwen.learning-audit.v1', items: [item('invalidated')] } })
      .mockRejectedValueOnce(new Error('disconnected'))
      .mockResolvedValueOnce({ ok: true, value: { schemaVersion: 'tianwen.learning-audit.v1', items: [] } })
    const rpc = { call: vi.fn() }
    const client = loadClientModule({
      list: createSessionList({ current: 'main', byId: {} }), rpc, learningAudit,
      locale: new TestLocale('zh'),
      setTimeout: ((callback: () => void) => { callbacks.push(callback); return 1 }) as never,
    })
    try {
      client.renderDock('main')
      await flushClient()
      const running = client.renderDock('main')
      expect(text(running)).toContain('验证中')
      expect(elements(running).some(element => element.props.role === 'status')).toBe(true)
      expect(findElement(running, element => element.props.role === 'status').props.style)
        .toMatchObject({ background: 'var(--dsw-alias-button-elevated-fill)' })
      expect(elements(running).some(element => element.type === 'button')).toBe(false)
      expect(learningAudit.mock.calls[0]?.[2]).toEqual({ sessionId: 'main' })
      callbacks.shift()!()
      await flushClient()
      expect(text(client.renderDock('main'))).toContain('已停止')
      expect(text(client.renderDock('main'))).not.toContain('验证中')
      callbacks.shift()!()
      await flushClient()
      expect(text(client.renderDock('main'))).toContain('状态暂不可用')
      expect(text(client.renderDock('main'))).not.toContain('已停止')
      expect(text(client.renderDock('other-main'))).not.toContain('已停止')
      await flushClient()
      expect(text(client.renderDock('other-main'))).toBe('')
      expect(learningAudit.mock.calls.at(-1)?.[2]).toEqual({ sessionId: 'other-main' })
      expect(rpc.call).not.toHaveBeenCalled()
    } finally {
      client.unmount()
    }
  })
  it('renders one active locale and switches copy without another RPC', async () => {
    const list = createSessionList({ current: undefined, byId: {} })
    const locale = new TestLocale('zh')
    const rpc = { call: vi.fn(async () => ({ ok: true, value: { goals: [] } })) }
    const client = loadClientModule({ list, locale, rpc })
    let tree = client.render()

    ;(findElement(tree, element => element.props['aria-label'] === '长期目标').props.onClick as () => void)()
    await flushClient()
    tree = client.render()

    expect(findElement(tree, element => element.props['aria-label'] === '长期目标')).toBeDefined()
    expect(text(tree)).toContain('还没有长期目标')
    expect(text(tree)).toContain('在 DSH 中打开或创建一个项目工作区')
    expect(text(tree)).toContain('创建一个长期目标，天问会规划并推进后续任务')
    expect(text(tree)).toContain('可随时补充信息或调整方向')
    expect(text(tree)).not.toContain('No Learn Loop plans yet')
    expect(locale.subscriberCount).toBe(1)

    ;(findButton(tree, '创建目标').props.onClick as () => void)()
    tree = client.render()
    expect(text(tree)).toContain('背景（可选）')
    expect(text(tree)).toContain('成功标准（可选）')
    expect(findButton(tree, '开始推进')).toBeDefined()

    const rpcCalls = rpc.call.mock.calls.length
    locale.set('en')
    tree = client.render()

    expect(findElement(tree, element => element.props['aria-label'] === 'Learn Loop')).toBeDefined()
    expect(text(tree)).toContain('Learn Loop')
    expect(text(tree)).not.toContain('长期目标')
    expect(elements(tree).some(element => element.props['aria-label'] === '长期目标')).toBe(false)
    expect(rpc.call).toHaveBeenCalledTimes(rpcCalls)
  })

  it('renders only the three goal-first fields and no authored Task or round controls', () => {
    const list = createSessionList({ current: undefined, byId: {} })
    const rpc = { call: vi.fn(async () => ({ ok: true, value: { goals: [] } })) }
    const client = loadClientModule({ list, rpc })
    const tree = openCreateForm(client.render)

    expect(elements(tree).filter(element => element.type === 'textarea')).toHaveLength(3)
    expect(text(tree)).toContain('Goal')
    expect(text(tree)).toContain('Context (optional)')
    expect(text(tree)).toContain('Success criteria (optional)')
    expect(findButton(tree, 'Start progressing')).toBeDefined()
    expect(findButton(tree, 'Back')).toBeDefined()
    expect(elements(tree).some(element => element.type === 'input' && element.props.type === 'number'))
      .toBe(false)
    expect(text(tree)).not.toContain('Maximum rounds per task')
    expect(text(tree)).not.toContain('Add task')
  })

  it('renders the optional audit as read-only durable facts', async () => {
    const learningAudit = vi.fn(async () => ({
      ok: true,
      value: {
        schemaVersion: 'tianwen.learning-audit.v1',
        items: [{
          analysisId: `analysis:${'a'.repeat(64)}`,
          ticketId: `ticket:${'b'.repeat(64)}`,
          phase: 'promoted',
          requestedAt: '2026-09-02T00:00:00.000Z',
          updatedAt: '2026-09-02T00:01:00.000Z',
          evidenceDigests: [`sha256:${'c'.repeat(64)}`],
          receipts: {}, recovery: null,
        }],
      },
    }))
    const client = loadClientModule({
      list: createSessionList({ current: undefined, byId: {} }), learningAudit,
      rpc: { call: vi.fn(async () => ({ ok: true, value: { goals: [] } })) },
    })
    let tree = client.render()
    ;(findElement(tree, element => element.props['aria-label'] === 'Learn Loop').props.onClick as () => void)()
    await flushClient()
    tree = client.render()

    const audit = findElement(tree, element => element.type === 'details')
    expect(text(audit)).toContain('Advanced audit (read-only)')
    expect(text(audit)).toContain('promoted')
    expect(text(audit)).toContain(`sha256:${'c'.repeat(64)}`)
    expect(elements(audit).filter(element => element.type === 'button')).toHaveLength(0)
    expect(learningAudit).toHaveBeenCalledOnce()
  })
  it('presents goal-first work as current, completed, next, and abandoned groups', async () => {
    const mixedStatus = {
      ...statusV2,
      goal: {
        ...statusV2.goal,
        completedTasks: 1,
        abandonedTasks: 1,
        totalTasks: 4,
      },
      tasks: [
        {
          id: 'task-complete', objective: 'Inspect the current behavior', phase: 'complete',
          execution: { goalId: 'goal-complete', sessionId: 'session-complete' }, resolution: null,
        },
        {
          id: 'task-abandoned', objective: 'Replace the whole interface', phase: 'abandoned',
          execution: { goalId: 'goal-abandoned', sessionId: 'session-abandoned' },
          resolution: 'abandoned',
        },
        statusV2.tasks[0],
        {
          id: 'task-next', objective: 'Polish the ordinary flow', phase: 'pending',
          execution: null, resolution: null,
        },
      ],
    } as const
    const summary = {
      schemaVersion: 'tianwen.long-goal-summary.v2',
      id: mixedStatus.goal.id,
      objective: mixedStatus.goal.objective,
      phase: mixedStatus.goal.phase,
      revision: mixedStatus.goal.revision,
      completedTasks: mixedStatus.goal.completedTasks,
      abandonedTasks: mixedStatus.goal.abandonedTasks,
      totalTasks: mixedStatus.goal.totalTasks,
      currentTaskId: mixedStatus.currentTaskId,
      updatedAt: 1,
    } as const
    const list = createSessionList({ current: undefined, byId: {} })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [summary] } }
      if (endpoint === 'status') return { ok: true, value: { status: mixedStatus } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    const tree = await openListedGoal(client.render, mixedStatus.goal.objective)

    expect(text(tree)).toContain('Tianwen planned these steps from your Goal')
    expect(text(findElement(tree, element => element.props['aria-label'] === 'Current work')))
      .toContain('Implement the Web flow — active')
    expect(text(findElement(tree, element => element.props['aria-label'] === 'Completed')))
      .toContain('Inspect the current behavior — complete')
    expect(text(findElement(tree, element => element.props['aria-label'] === 'Next steps')))
      .toContain('Polish the ordinary flow — pending')
    expect(text(findElement(tree, element => element.props['aria-label'] === 'Abandoned')))
      .toContain('Replace the whole interface — abandoned')
    expect(findButton(tree, 'Continue current work')).toBeDefined()
  })

  it('keeps continuous Goals in optional advanced history without legacy control buttons', async () => {
    const summary = {
      schemaVersion: 'tianwen.long-goal-summary.v3',
      id: continuousStatus.goal.id,
      objective: continuousStatus.goal.objective,
      phase: continuousStatus.goal.phase,
      revision: continuousStatus.goal.revision,
      completedTasks: continuousStatus.goal.completedTasks,
      abandonedTasks: continuousStatus.goal.abandonedTasks,
      totalTasks: continuousStatus.goal.totalTasks,
      currentTaskId: continuousStatus.currentTaskId,
      updatedAt: 1,
      control: continuousStatus.control,
    } as const
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [summary] } }
      if (endpoint === 'status') return { ok: true, value: { status: continuousStatus } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({
      list: createSessionList({ current: undefined, byId: {} }),
      rpc,
    })

    let tree = client.render()
    expect(elements(tree).some(element => element.props.role === 'dialog')).toBe(false)
    expect(rpc.call).not.toHaveBeenCalled()

    tree = await openListedGoal(client.render, continuousStatus.goal.objective)
    expect(text(findElement(tree, element => element.props['aria-label'] === 'Current work')))
      .toContain('Implement the Web flow — active')
    expect(text(findElement(tree, element => element.props['aria-label'] === 'Completed')))
      .toContain('Inspect the existing flow — complete')
    expect(text(findElement(tree, element => element.props['aria-label'] === 'Next steps')))
      .toContain('Verify compatibility — pending')
    expect(text(tree)).not.toContain('Helpful')
    expect(text(tree)).not.toContain('Needs improvement')
    for (const label of ['Continue current work', 'Add guidance', 'Abandon this Task and replan']) {
      expect(elements(tree).some(element => element.type === 'button' && text(element) === label))
        .toBe(false)
    }
    expect(elements(tree).some(element => element.props['aria-label'] === 'Guidance')).toBe(false)
    expect(rpc.call.mock.calls.map(call => call[1])).toEqual(['list', 'status'])
  })

  it('keeps a replannable pending Task under next steps and labels the action as planning', async () => {
    const replanningStatus = {
      ...statusV2,
      goal: {
        ...statusV2.goal,
        phase: 'planning',
        completedTasks: 1,
        totalTasks: 2,
      },
      tasks: [
        {
          id: 'task-complete', objective: 'Inspect the completed work', phase: 'complete',
          execution: { goalId: 'goal-complete', sessionId: 'session-complete' }, resolution: null,
        },
        {
          id: 'task-pending', objective: 'Reconsider the planned follow-up', phase: 'pending',
          execution: null, resolution: null,
        },
      ],
      currentTaskId: 'task-pending',
    } as const
    const summary = {
      schemaVersion: 'tianwen.long-goal-summary.v2',
      id: replanningStatus.goal.id,
      objective: replanningStatus.goal.objective,
      phase: replanningStatus.goal.phase,
      revision: replanningStatus.goal.revision,
      completedTasks: replanningStatus.goal.completedTasks,
      abandonedTasks: replanningStatus.goal.abandonedTasks,
      totalTasks: replanningStatus.goal.totalTasks,
      currentTaskId: replanningStatus.currentTaskId,
      updatedAt: 1,
    } as const
    const list = createSessionList({ current: undefined, byId: {} })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [summary] } }
      if (endpoint === 'status') return { ok: true, value: { status: replanningStatus } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    const tree = await openListedGoal(client.render, replanningStatus.goal.objective)

    expect(text(findElement(tree, element => element.props['aria-label'] === 'Current work')))
      .not.toContain('Reconsider the planned follow-up')
    expect(text(findElement(tree, element => element.props['aria-label'] === 'Next steps')))
      .toContain('Reconsider the planned follow-up — pending')
    expect(findButton(tree, 'Continue planning')).toBeDefined()
  })

  it('opens the returned Task Session after it enters the projection', async () => {
    const list = createSessionList({
      current: 'workspace-session',
      byId: {
        'workspace-session': sessionRow({ sessionId: 'workspace-session', cwd: 'D:/workspace' }),
      },
    })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [] } }
      if (endpoint === 'create-goal-first') {
        return { ok: true, value: {
          schemaVersion: 'tianwen.goal-first-progress-result.v2',
          action: 'started',
          status: statusV2,
          sessionId: 'task-session',
        } }
      }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    const tree = await createGoal(client.render)

    expect(rpc.call.mock.calls[1]).toEqual(['/tianwen', 'create-goal-first', {
      objective: 'Ship goal-first Learn Loop',
      context: 'Keep the existing overlay',
      successCriteria: 'Users author one Goal',
      workspaceSessionId: 'workspace-session',
    }, expect.any(AbortSignal)])
    expect(text(tree)).toContain('Ship goal-first Learn Loop')
    expect(client.open).not.toHaveBeenCalled()
    list.set({
      current: 'workspace-session',
      byId: {
        'workspace-session': sessionRow({ sessionId: 'workspace-session', cwd: 'D:/workspace' }),
        'task-session': sessionRow({ sessionId: 'task-session', cwd: 'D:/workspace' }),
      },
    })
    await flushClient()
    expect(client.open).toHaveBeenCalledWith('task-session')
    expect(text(client.render())).not.toContain('Ship goal-first Learn Loop')
  })

  it('does not navigate when returning to the Goal list while Task Session projection is pending', async () => {
    const workspace = sessionRow({ sessionId: 'workspace-session', cwd: 'D:/workspace' })
    const list = createSessionList({ current: 'workspace-session', byId: { 'workspace-session': workspace } })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [] } }
      if (endpoint === 'create-goal-first') return { ok: true, value: {
        schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'started',
        status: statusV2, sessionId: 'task-session',
      } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    let tree = await createGoal(client.render)
    ;(findButton(tree, 'Back').props.onClick as () => void)()
    list.set({
      current: 'workspace-session',
      byId: { 'workspace-session': workspace, 'task-session': sessionRow({ sessionId: 'task-session', cwd: 'D:/workspace' }) },
    })
    await flushClient()

    expect(client.open).not.toHaveBeenCalled()
    expect(findButton(client.render(), 'Create Goal')).toBeDefined()
  })

  it('opens the Task Session returned by Continue after it enters the projection', async () => {
    const workspace = sessionRow({ sessionId: 'workspace-session', cwd: 'D:/workspace' })
    const list = createSessionList({ current: 'workspace-session', byId: { 'workspace-session': workspace } })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [] } }
      if (endpoint === 'create-goal-first') return { ok: true, value: {
        schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'planning-pending',
        status: planningStatus, sessionId: null,
      } }
      if (endpoint === 'continue-progress') return { ok: true, value: {
        schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'continued',
        status: statusV2, sessionId: 'task-session',
      } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    let tree = await createGoal(client.render)
    ;(findButton(tree, 'Continue planning').props.onClick as () => void)()
    await flushClient()

    expect(client.open).not.toHaveBeenCalled()
    list.set({
      current: 'workspace-session',
      byId: {
        'workspace-session': workspace,
        'task-session': sessionRow({ sessionId: 'task-session', cwd: 'D:/workspace' }),
      },
    })
    await flushClient()

    expect(client.open).toHaveBeenCalledWith('task-session')
    expect(text(client.render())).not.toContain('Ship goal-first Learn Loop')
  })

  it('reads the authoritative Goal status when reopening after Task Session navigation', async () => {
    const workspace = sessionRow({ sessionId: 'workspace-session', cwd: 'D:/workspace' })
    const taskSession = sessionRow({ sessionId: 'task-session', cwd: 'D:/workspace' })
    const list = createSessionList({
      current: 'workspace-session',
      byId: { 'workspace-session': workspace, 'task-session': taskSession },
    })
    const authoritative = {
      ...statusV2,
      goal: {
        ...statusV2.goal,
        objective: 'Authoritative completed Task status',
        phase: 'planning',
        revision: 5,
        completedTasks: 1,
      },
      tasks: [{ ...statusV2.tasks[0], phase: 'complete' }],
      currentTaskId: null,
    } as const
    const authoritativeSummary = {
      schemaVersion: 'tianwen.long-goal-summary.v2',
      id: 'goal-first-1',
      objective: 'Authoritative completed Task status',
      phase: 'planning',
      revision: 5,
      completedTasks: 1,
      abandonedTasks: 0,
      totalTasks: 1,
      currentTaskId: null,
      updatedAt: 2,
    } as const
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [authoritativeSummary] } }
      if (endpoint === 'create-goal-first') return { ok: true, value: {
        schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'planning-pending',
        status: planningStatus, sessionId: null,
      } }
      if (endpoint === 'continue-progress') return { ok: true, value: {
        schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'continued',
        status: statusV2, sessionId: 'task-session',
      } }
      if (endpoint === 'status') return { ok: true, value: { status: authoritative } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    let tree = await createGoal(client.render)
    ;(findButton(tree, 'Continue planning').props.onClick as () => void)()
    await flushClient()
    expect(client.open).toHaveBeenCalledWith('task-session')

    tree = client.render()
    ;(findElement(tree, element => element.props['aria-label'] === 'Learn Loop').props.onClick as () => void)()
    await flushClient()
    tree = client.render()
    ;(findElement(tree, element => element.type === 'button' &&
      text(element).includes('Authoritative completed Task status')).props.onClick as () => void)()
    await flushClient()

    const refreshedTree = client.render()
    expect(text(refreshedTree)).toContain('Authoritative completed Task status')
    expect(text(refreshedTree)).toContain('1/1 tasks complete')
    expect(text(refreshedTree)).toContain('Implement the Web flow — complete')
    expect(rpc.call.mock.calls.map(call => call[1])).toEqual([
      'list', 'create-goal-first', 'continue-progress', 'list', 'status',
    ])
  })

  it('keeps settled Goal detail free of Tianwen feedback controls across reopen', async () => {
    const completed = {
      ...statusV2,
      goal: {
        ...statusV2.goal, phase: 'complete', completedTasks: 1,
      },
      planner: { ...statusV2.planner, phase: 'complete' },
      tasks: [{ ...statusV2.tasks[0], phase: 'complete' }],
      currentTaskId: null,
    } as const
    const summary = {
      schemaVersion: 'tianwen.long-goal-summary.v2',
      id: completed.goal.id, objective: completed.goal.objective,
      phase: completed.goal.phase, revision: completed.goal.revision,
      completedTasks: 1, abandonedTasks: 0, totalTasks: 1,
      currentTaskId: null, updatedAt: 1,
    } as const
    const list = createSessionList({ current: undefined, byId: {} })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [summary] } }
      if (endpoint === 'status') return { ok: true, value: { status: completed } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    let tree = await openListedGoal(client.render, completed.goal.objective)

    expect(text(tree)).not.toContain('Helpful')
    expect(text(tree)).not.toContain('Needs improvement')
    expect(elements(tree).some(element => element.type === 'textarea' &&
      element.props['aria-label'] === 'What should improve? (optional)')).toBe(false)
    ;(findButton(tree, 'Back').props.onClick as () => void)()
    await flushClient()
    tree = client.render()
    ;(findElement(tree, element => element.type === 'button' &&
      text(element).includes(completed.goal.objective)).props.onClick as () => void)()
    await flushClient()
    tree = client.render()

    expect(text(tree)).toContain(completed.goal.objective)
    expect(text(tree)).toContain('Implement the Web flow — complete')
    expect(text(tree)).not.toContain('Helpful')
    expect(text(tree)).not.toContain('Needs improvement')
    expect(rpc.call.mock.calls.map(call => call[1])).toEqual([
      'list', 'status', 'list', 'status',
    ])
  })

  it('keeps Goal detail for a null Task Session and guidance never invokes Continue implicitly', async () => {
    const selected = sessionRow({ sessionId: 'workspace-session', cwd: 'D:/workspace' })
    const list = createSessionList({ current: 'workspace-session', byId: { 'workspace-session': selected } })
    const revision5 = { ...planningStatus, goal: { ...planningStatus.goal, revision: 5 } }
    const revision6 = {
      ...planningStatus,
      goal: { ...planningStatus.goal, revision: 6 },
      planner: { ...planningStatus.planner, phase: 'needs-replan' },
      guidance: ['Prefer native controls'],
    }
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [] } }
      if (endpoint === 'create-goal-first') return { ok: true, value: {
        schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'planning-pending',
        status: planningStatus, sessionId: null,
      } }
      if (endpoint === 'continue-progress') return { ok: true, value: {
        schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'planning-pending',
        status: revision5, sessionId: null,
      } }
      if (endpoint === 'add-guidance') return { ok: true, value: {
        schemaVersion: 'tianwen.long-goal-guidance-result.v2', planning: 'updated', status: revision6,
      } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    let tree = await createGoal(client.render)
    ;(findButton(tree, 'Continue planning').props.onClick as () => void)()
    await flushClient()
    tree = client.render()
    ;(findElement(tree, element => element.type === 'textarea' &&
      element.props['aria-label'] === 'Guidance').props.onChange as Function)({
      target: { value: 'Prefer native controls' },
    })
    tree = client.render()
    ;(findButton(tree, 'Add guidance').props.onClick as () => void)()
    await flushClient()

    const continueCall = rpc.call.mock.calls.find(call => call[1] === 'continue-progress')
    const guidanceCall = rpc.call.mock.calls.find(call => call[1] === 'add-guidance')
    expect(continueCall?.[2]).toEqual({ longGoalId: 'goal-first-1', expectedRevision: 1 })
    expect(guidanceCall?.[2]).toEqual({
      longGoalId: 'goal-first-1', expectedRevision: 5, text: 'Prefer native controls',
    })
    expect(rpc.call.mock.calls.filter(call => call[1] === 'continue-progress')).toHaveLength(1)
    expect(rpc.call.mock.calls.map(call => call[1])).toEqual([
      'list', 'create-goal-first', 'continue-progress', 'add-guidance',
    ])
    expect(text(client.render())).toContain('Prefer native controls')
  })

  it('clears an unsent guidance draft when switching to another Goal', async () => {
    const selected = sessionRow({ sessionId: 'workspace-session', cwd: 'D:/workspace' })
    const list = createSessionList({
      current: 'workspace-session',
      byId: { 'workspace-session': selected },
    })
    const secondStatus = {
      ...planningStatus,
      goal: { ...planningStatus.goal, id: 'goal-first-2', objective: 'Second Goal' },
    }
    let createCalls = 0
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [] } }
      if (endpoint === 'create-goal-first') {
        createCalls += 1
        return { ok: true, value: {
          schemaVersion: 'tianwen.goal-first-progress-result.v2',
          action: 'planning-pending',
          status: createCalls === 1 ? planningStatus : secondStatus,
          sessionId: null,
        } }
      }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    let tree = await createGoal(client.render)
    ;(findElement(tree, element => element.type === 'textarea' &&
      element.props['aria-label'] === 'Guidance').props.onChange as Function)({
      target: { value: 'Draft meant only for the first Goal' },
    })
    tree = client.render()
    ;(findButton(tree, 'Back').props.onClick as () => void)()
    tree = client.render()
    ;(findButton(tree, 'Create Goal').props.onClick as () => void)()
    tree = client.render()
    ;(findElement(tree, element => element.type === 'form').props.onSubmit as Function)({
      preventDefault: () => undefined,
    })
    await flushClient()

    const secondTree = client.render()
    expect(text(secondTree)).toContain('Second Goal')
    expect(findElement(secondTree, element => element.type === 'textarea' &&
      element.props['aria-label'] === 'Guidance').props.value).toBe('')
  })

  it('refreshes exactly once on revision conflict without replaying the mutation', async () => {
    const selected = sessionRow({ sessionId: 'workspace-session', cwd: 'D:/workspace' })
    const list = createSessionList({ current: 'workspace-session', byId: { 'workspace-session': selected } })
    const refreshed = {
      ...statusV2,
      goal: { ...statusV2.goal, objective: 'Refreshed authoritative Goal', revision: 5 },
    }
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [] } }
      if (endpoint === 'create-goal-first') return { ok: true, value: {
        schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'planning-pending',
        status: planningStatus, sessionId: null,
      } }
      if (endpoint === 'continue-progress') return { ok: false, error: {
        code: 'revision-conflict', message: 'revision-conflict',
        details: { expectedRevision: 4, currentRevision: 5 },
      } }
      if (endpoint === 'status') return { ok: true, value: { status: refreshed } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    let tree = await createGoal(client.render)
    ;(findButton(tree, 'Continue planning').props.onClick as () => void)()
    await flushClient()

    expect(rpc.call.mock.calls.filter(call => call[1] === 'continue-progress')).toHaveLength(1)
    expect(rpc.call.mock.calls.filter(call => call[1] === 'status')).toHaveLength(1)
    expect(text(client.render())).toContain('Refreshed authoritative Goal')
    expect(text(client.render())).toContain('changed elsewhere')
  })

  it('requires a selected workspace Session and localizes blocked recovery actions', async () => {
    const noWorkspace = createSessionList({ current: undefined, byId: {} })
    const unboundRpc = { call: vi.fn(async () => ({ ok: true, value: { goals: [] } })) }
    const unboundClient = loadClientModule({ list: noWorkspace, rpc: unboundRpc })
    const unboundTree = openCreateForm(unboundClient.render)
    expect(findButton(unboundTree, 'Start progressing').props.disabled).toBe(true)
    expect(text(unboundTree)).toContain('Open or create a DSH Workspace first')

    const blockedStatus = {
      ...statusV2,
      goal: { ...statusV2.goal, phase: 'blocked' },
      tasks: [{
        ...statusV2.tasks[0],
        phase: 'blocked',
        blockedReason: { code: 'round-limit', message: 'Task reached its round limit.' },
      }],
    } as const
    const blockedList = createSessionList({
      current: 'workspace-session',
      byId: { 'workspace-session': sessionRow({
        sessionId: 'workspace-session', cwd: 'D:/workspace', running: false,
      }) },
    })
    const afterAbandon = {
      ...blockedStatus,
      goal: { ...blockedStatus.goal, phase: 'planning', revision: 5, abandonedTasks: 1 },
      planner: { ...blockedStatus.planner, phase: 'needs-replan' },
      tasks: [{
        id: blockedStatus.tasks[0].id,
        objective: blockedStatus.tasks[0].objective,
        phase: 'abandoned',
        execution: blockedStatus.tasks[0].execution,
        resolution: 'abandoned',
      }],
      currentTaskId: null,
    }
    const blockedSummary = {
      schemaVersion: 'tianwen.long-goal-summary.v2',
      id: 'goal-first-1',
      objective: 'Ship goal-first Learn Loop',
      phase: 'blocked',
      revision: 4,
      completedTasks: 0,
      abandonedTasks: 0,
      totalTasks: 1,
      currentTaskId: 'task-v2-1',
      updatedAt: 1,
    } as const
    const blockedRpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [blockedSummary] } }
      if (endpoint === 'status') return { ok: true, value: { status: blockedStatus } }
      if (endpoint === 'abandon-current-task') return { ok: true, value: {
        schemaVersion: 'tianwen.long-goal-abandon-result.v2', action: 'abandoned',
        status: afterAbandon,
      } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const locale = new TestLocale('en')
    const blockedClient = loadClientModule({ list: blockedList, locale, rpc: blockedRpc })
    let blockedTree = await openListedGoal(blockedClient.render, 'Ship goal-first Learn Loop')
    expect(findButton(blockedTree, 'Open Session')).toBeDefined()
    expect(findButton(blockedTree, 'Abandon this Task and replan')).toBeDefined()
    expect(text(blockedTree)).toContain('Task reached its round limit.')
    expect(elements(blockedTree).some(element => element.type === 'button' &&
      text(element) === 'Continue progress')).toBe(false)

    locale.set('zh')
    blockedTree = blockedClient.render()
    expect(findButton(blockedTree, '打开会话')).toBeDefined()
    expect(findButton(blockedTree, '放弃当前任务并重新规划')).toBeDefined()
    ;(findButton(blockedTree, '放弃当前任务并重新规划').props.onClick as () => void)()
    await flushClient()

    const abandonCall = blockedRpc.call.mock.calls.find(call => call[1] === 'abandon-current-task')
    expect(abandonCall?.[2]).toEqual({ longGoalId: 'goal-first-1', expectedRevision: 4 })
    const zhBlockedTree = blockedClient.render()
    expect(text(zhBlockedTree)).not.toContain('Task reached its round limit.')
    expect(text(zhBlockedTree)).not.toContain('Abandon this Task and replan')
    expect(text(zhBlockedTree)).toContain('继续规划')
  })

  it('keeps v1 rendering/execution and prevents late navigation after close', async () => {
    const selected = sessionRow({ sessionId: 'selected', cwd: 'D:/workspace' })
    const list = createSessionList({ current: 'selected', byId: { selected } })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [summaryV1] } }
      if (endpoint === 'status') return { ok: true, value: { status: unboundStatus } }
      if (endpoint === 'run-current-task') return { ok: true, value: {
        status: coldStatus, sessionId: 'session-new', action: 'started',
      } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    let tree = await openListedGoal(client.render, 'Ship Learn Loop')
    expect(findButton(tree, 'Start Task').props.disabled).toBe(false)
    ;(findButton(tree, 'Start Task').props.onClick as () => void)()
    await flushClient()
    tree = client.render()
    ;(findButton(tree, 'Close').props.onClick as () => void)()
    list.set({
      current: 'selected',
      byId: {
        selected,
        'session-new': sessionRow({ sessionId: 'session-new', cwd: 'D:/workspace' }),
      },
    })
    await flushClient()

    expect(rpc.call.mock.calls.map(call => call[1])).toEqual(['list', 'status', 'run-current-task'])
    expect(client.open).not.toHaveBeenCalled()
  })
})
