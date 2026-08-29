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
  private currentHooks: unknown[] | undefined
  private cursor = 0

  readonly react = {
    useCallback: <T>(callback: T): T => {
      this.cursor += 1
      return callback
    },
    useEffect: (effect: () => void | (() => void)): void => {
      this.cursor += 1
      effect()
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
  readonly open?: ReturnType<typeof vi.fn>
  readonly locale?: TestLocale
}) {
  const runtime = new ClientComponentRuntime()
  let exports: { apply(ctx: unknown): void } | undefined
  let slot: ((props: { readonly wide: boolean }) => unknown) | undefined
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
    { window, AbortController, AbortSignal, console, setTimeout, clearTimeout },
  )
  if (exports === undefined) throw new Error('client module did not register')
  exports.apply({
    connection: { rpc: input.rpc },
    locale: input.locale ?? new TestLocale('en'),
    sessions: { list: input.list, open },
    slots: {
      inject: (_name: string, callback: () => unknown) => callback(),
      register: (_options: unknown, component: typeof slot) => {
        slot = component
        return () => undefined
      },
    },
  })
  if (slot === undefined) throw new Error('sidebar action was not registered')
  return {
    open,
    render: () => runtime.render(slot!({ wide: true })),
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
  ;(findButton(tree, 'Create plan').props.onClick as () => void)()
  return render()
}

async function createPlan(render: () => unknown): Promise<unknown> {
  let tree = openCreateForm(render)
  ;(findElement(tree, element => element.type === 'textarea').props.onChange as Function)({
    target: { value: 'Ship Learn Loop' },
  })
  tree = render()
  ;(findElement(tree, element => element.props['aria-label'] === 'Task 1').props.onChange as Function)({
    target: { value: 'Open the UI' },
  })
  tree = render()
  ;(findElement(tree, element => element.type === 'form').props.onSubmit as Function)({
    preventDefault: () => undefined,
  })
  await flushClient()
  return render()
}

describe('Learn Loop compiled DSH client module', () => {
  it('renders one active locale and switches copy without another RPC', async () => {
    const list = createSessionList({ current: undefined, byId: {} })
    const locale = new TestLocale('zh')
    const rpc = { call: vi.fn(async () => ({ ok: true, value: { goals: [] } })) }
    const client = loadClientModule({ list, locale, rpc })
    let tree = client.render()

    ;(findElement(tree, element => element.props['aria-label'] === '长期任务').props.onClick as () => void)()
    await flushClient()
    tree = client.render()

    expect(findElement(tree, element => element.props['aria-label'] === '长期任务')).toBeDefined()
    expect(text(tree)).toContain('还没有长期任务')
    expect(text(tree)).toContain('在 DSH 中打开或创建一个项目工作区')
    expect(text(tree)).toContain('创建一个长期目标，并按执行顺序填写任务')
    expect(text(tree)).toContain('启动当前任务，天问会在独立 DSH 会话中继续执行')
    expect(text(tree)).not.toContain('No Learn Loop plans yet')
    expect(locale.subscriberCount).toBe(1)

    const rpcCalls = rpc.call.mock.calls.length
    locale.set('en')
    tree = client.render()

    expect(findElement(tree, element => element.props['aria-label'] === 'Learn Loop')).toBeDefined()
    expect(text(tree)).toContain('Learn Loop')
    expect(text(tree)).not.toContain('长期任务')
    expect(elements(tree).some(element => element.props['aria-label'] === '长期任务')).toBe(false)
    expect(rpc.call).toHaveBeenCalledTimes(rpcCalls)
  })

  it('keeps an authored Task row key stable while its text changes', () => {
    const list = createSessionList({ current: undefined, byId: {} })
    const rpc = { call: vi.fn(async () => ({ ok: true, value: { goals: [] } })) }
    const client = loadClientModule({ list, rpc })
    let tree = openCreateForm(client.render)
    const row = () => findElement(tree, element => element.type === 'div' &&
      (Array.isArray(element.props.children) ? element.props.children : [element.props.children])
        .some(child => isElement(child) && child.props['aria-label'] === 'Task 1'))
    const before = row().key

    ;(findElement(tree, element => element.props['aria-label'] === 'Task 1').props.onChange as Function)({
      target: { value: 'Keep focus while editing' },
    })
    tree = client.render()

    expect(row().key).toBe(before)
  })

  it('opens the overlay, creates a plan, continues a cold Task, closes, then navigates', async () => {
    const list = createSessionList({
      current: 'session-1',
      byId: {
        'session-1': sessionRow({
          sessionId: 'session-1', cwd: 'D:/workspace', running: false, goalId: 'goal-1',
        }),
      },
    })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [] } }
      if (endpoint === 'create') return { ok: true, value: { status: coldStatus } }
      if (endpoint === 'run-current-task') {
        return { ok: true, value: { status: coldStatus, sessionId: 'session-1', action: 'continued' } }
      }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    let render!: () => unknown
    let dialogPresentWhenOpened = true
    const open = vi.fn(() => {
      dialogPresentWhenOpened = elements(render()).some(element => element.props.role === 'dialog')
    })
    const client = loadClientModule({ list, rpc, open })
    render = client.render
    const tree = await createPlan(render)

    const action = findButton(tree, 'Continue Task')
    expect(action.props.disabled).toBe(false)
    ;(action.props.onClick as () => void)()
    await flushClient()

    expect(rpc.call.mock.calls.map(call => call[1])).toEqual([
      'list', 'create', 'run-current-task',
    ])
    expect(open).toHaveBeenCalledWith('session-1')
    expect(dialogPresentWhenOpened).toBe(false)
  })

  it('opens only a running Session whose projected Goal matches the Task binding', async () => {
    const runningList = createSessionList({
      current: 'session-1',
      byId: { 'session-1': sessionRow({
        sessionId: 'session-1', running: true, goalId: 'goal-1',
      }) },
    })
    const runningRpc = { call: vi.fn(async (_channel: string, endpoint: string) => endpoint === 'list'
      ? { ok: true, value: { goals: [] } }
      : { ok: true, value: { status: coldStatus } }) }
    const runningClient = loadClientModule({ list: runningList, rpc: runningRpc })
    const runningTree = await createPlan(runningClient.render)
    ;(findButton(runningTree, 'Open Session').props.onClick as () => void)()
    expect(runningClient.open).toHaveBeenCalledWith('session-1')
    expect(runningRpc.call.mock.calls.map(call => call[1])).toEqual(['list', 'create'])

    const mismatchList = createSessionList({
      current: 'session-1',
      byId: { 'session-1': sessionRow({
        sessionId: 'session-1', running: true, goalId: 'goal-other',
      }) },
    })
    const mismatchRpc = { call: vi.fn(async (_channel: string, endpoint: string) => endpoint === 'list'
      ? { ok: true, value: { goals: [] } }
      : { ok: true, value: { status: coldStatus } }) }
    const mismatchClient = loadClientModule({ list: mismatchList, rpc: mismatchRpc })
    const mismatchTree = await createPlan(mismatchClient.render)
    expect(findButton(mismatchTree, 'Continue Task').props.disabled).toBe(true)
    expect(text(mismatchTree)).toContain('does not match this Task')
    expect(mismatchClient.open).not.toHaveBeenCalled()
  })

  it('waits for the exact started Session projection before navigating', async () => {
    const selected = sessionRow({ sessionId: 'selected', cwd: 'D:/workspace' })
    const list = createSessionList({ current: 'selected', byId: { selected } })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [] } }
      if (endpoint === 'create') return { ok: true, value: { status: unboundStatus } }
      if (endpoint === 'run-current-task') {
        return { ok: true, value: { status: coldStatus, sessionId: 'session-new', action: 'started' } }
      }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    const tree = await createPlan(client.render)
    ;(findButton(tree, 'Start Task').props.onClick as () => void)()
    await flushClient()

    expect(client.open).not.toHaveBeenCalled()
    list.set({
      current: 'selected',
      byId: {
        selected,
        'session-new': sessionRow({ sessionId: 'session-new', cwd: 'D:/workspace' }),
      },
    })
    await flushClient()

    expect(client.open).toHaveBeenCalledWith('session-new')
  })

  it('does not navigate after the overlay closes while Session projection is pending', async () => {
    const selected = sessionRow({ sessionId: 'selected', cwd: 'D:/workspace' })
    const list = createSessionList({ current: 'selected', byId: { selected } })
    const rpc = { call: vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'list') return { ok: true, value: { goals: [] } }
      if (endpoint === 'create') return { ok: true, value: { status: unboundStatus } }
      if (endpoint === 'run-current-task') {
        return { ok: true, value: { status: coldStatus, sessionId: 'session-new', action: 'started' } }
      }
      throw new Error(`unexpected endpoint ${endpoint}`)
    }) }
    const client = loadClientModule({ list, rpc })
    let tree = await createPlan(client.render)
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

    expect(client.open).not.toHaveBeenCalled()
  })

  it('disables Start without a selected workspace and disables blocked Tasks with reasons', async () => {
    const noWorkspace = createSessionList({ current: undefined, byId: {} })
    const unboundRpc = { call: vi.fn(async (_channel: string, endpoint: string) => endpoint === 'list'
      ? { ok: true, value: { goals: [] } }
      : { ok: true, value: { status: unboundStatus } }) }
    const unboundClient = loadClientModule({ list: noWorkspace, rpc: unboundRpc })
    const unboundTree = await createPlan(unboundClient.render)
    expect(findButton(unboundTree, 'Start Task').props.disabled).toBe(true)
    expect(text(unboundTree)).toContain('Open or create a DSH Workspace first')

    const blockedStatus = {
      ...coldStatus,
      goal: { ...coldStatus.goal, phase: 'blocked' },
      tasks: [{
        ...coldStatus.tasks[0],
        phase: 'blocked',
        blockedReason: { code: 'round-limit', message: 'Task reached its round limit.' },
      }],
    } as const
    const blockedList = createSessionList({
      current: 'session-1',
      byId: { 'session-1': sessionRow({
        sessionId: 'session-1', running: false, goalId: 'goal-1', goalPhase: 'blocked',
      }) },
    })
    const blockedRpc = { call: vi.fn(async (_channel: string, endpoint: string) => endpoint === 'list'
      ? { ok: true, value: { goals: [] } }
      : { ok: true, value: { status: blockedStatus } }) }
    const locale = new TestLocale('en')
    const blockedClient = loadClientModule({ list: blockedList, locale, rpc: blockedRpc })
    const blockedTree = await createPlan(blockedClient.render)
    expect(findButton(blockedTree, 'Continue Task').props.disabled).toBe(true)
    expect(text(blockedTree)).toContain('Task reached its round limit.')

    locale.set('zh')
    const zhBlockedTree = blockedClient.render()
    expect(findButton(zhBlockedTree, '继续任务').props.disabled).toBe(true)
    expect(text(zhBlockedTree)).toContain('Task reached its round limit.')
    expect(text(zhBlockedTree)).not.toContain('Continue Task')
  })
})
