import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { LongGoalStatusProjection, LongGoalSummary } from './long-goal-contract.js'
import { createLearnLoopClient } from './learn-loop-client.js'

type View = 'closed' | 'list' | 'create' | 'detail'

export interface RequestGeneration {
  begin(): RequestHandle
  close(): void
}

export interface RequestHandle {
  readonly signal: AbortSignal
  isCurrent(): boolean
}

export function createRequestGeneration(): RequestGeneration {
  let current = 0
  let active: AbortController | undefined
  return {
    begin: () => {
      active?.abort()
      const generation = ++current
      const controller = new AbortController()
      active = controller
      return {
        signal: controller.signal,
        isCurrent: () => generation === current && !controller.signal.aborted,
      }
    },
    close: () => {
      current += 1
      active?.abort()
      active = undefined
    },
  }
}

interface SessionGoalProjection {
  readonly goal: {
    readonly id: string
    readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
    readonly blockedReason?: { readonly message: string }
  }
}

interface SessionListSnapshot {
  readonly current: string | undefined
  readonly byId: Readonly<Record<string, {
    readonly cwd?: string
    readonly running: boolean
    readonly projectionValues?: {
      readonly goal?: SessionGoalProjection | null
    }
  }>>
}

interface SessionListSource {
  getSnapshot(): SessionListSnapshot
  subscribe(listener: () => void): () => void
}

export interface ClientContext {
  readonly connection: {
    readonly rpc: Parameters<typeof createLearnLoopClient>[0]
  }
  readonly sessions: {
    readonly list: {
      getSnapshot(): SessionListSnapshot
      subscribe(listener: () => void): () => void
    }
    open(sessionId: string): void
  }
  readonly slots: {
    inject(
      name: 'sidebar.footer.action',
      callback: () => (() => void),
    ): () => void
    register(
      options: {
        readonly name: 'sidebar.footer.action'
        readonly id: 'tianwen-learn-loop'
        readonly order: 20
      },
      component: (props: { readonly wide: boolean }) => JSX.Element,
    ): () => void
  }
}

const fieldStyle = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box' as const,
  color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-alias-button-elevated-fill)',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  font: 'inherit',
  padding: '8px 10px',
}

const buttonStyle = {
  color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-alias-button-elevated-fill)',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  cursor: 'pointer',
  font: 'inherit',
  padding: '8px 10px',
}

function LoopIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

export function taskAction(
  status: LongGoalStatusProjection,
  sessions: SessionListSnapshot,
): {
  readonly label: 'Start Task' | 'Continue Task' | 'Open Session' | 'Plan complete'
  readonly sessionId?: string
  readonly disabled: boolean
  readonly reason?: string
} {
  const task = status.tasks.find(candidate => candidate.id === status.currentTaskId)
  if (task === undefined) return { label: 'Plan complete', disabled: true }
  if (task.execution !== null) {
    const session = sessions.byId[task.execution.sessionId]
    const projectedGoal = session?.projectionValues?.goal?.goal
    if (session === undefined) {
      return {
        label: 'Continue Task',
        disabled: true,
        reason: 'The bound DSH Session is not available.',
      }
    }
    if (projectedGoal === undefined || String(projectedGoal.id) !== task.execution.goalId) {
      return {
        label: 'Continue Task',
        disabled: true,
        reason: 'The bound DSH Session Goal does not match this Task.',
      }
    }
    if (task.phase === 'blocked' || projectedGoal.phase === 'blocked') {
      return {
        label: 'Continue Task',
        disabled: true,
        reason: task.blockedReason?.message ?? projectedGoal.blockedReason?.message ??
          'This Task is blocked and cannot be continued.',
      }
    }
    if (session.running && projectedGoal.phase === 'active') {
      return {
        label: 'Open Session',
        sessionId: task.execution.sessionId,
        disabled: false,
      }
    }
    if (projectedGoal.phase === 'active' || projectedGoal.phase === 'paused') {
      return { label: 'Continue Task', disabled: false }
    }
    return {
      label: 'Continue Task',
      disabled: true,
      reason: 'The bound DSH Session Goal is not resumable.',
    }
  }
  if (task.phase === 'blocked') {
    return {
      label: 'Start Task',
      disabled: true,
      reason: task.blockedReason?.message ?? 'This Task is blocked and cannot be continued.',
    }
  }
  const firstTask = status.tasks[0]?.id === task.id
  const selectedCwd = sessions.current === undefined
    ? undefined
    : sessions.byId[sessions.current]?.cwd
  if (firstTask && (selectedCwd === undefined || selectedCwd.trim().length === 0)) {
    return {
      label: 'Start Task',
      disabled: true,
      reason: 'Open or create a DSH Workspace first.',
    }
  }
  return { label: 'Start Task', disabled: false }
}

function abortError(): Error {
  const error = new Error('Learn Loop request cancelled')
  error.name = 'AbortError'
  return error
}

export function waitForSessionProjection(
  list: SessionListSource,
  sessionId: string,
  signal: AbortSignal,
  timeoutMs = 10_000,
): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError())
  if (list.getSnapshot().byId[sessionId] !== undefined) return Promise.resolve()
  return new Promise((resolveWait, rejectWait) => {
    let unsubscribe: () => void = () => undefined
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      unsubscribe()
      signal.removeEventListener('abort', onAbort)
      if (error === undefined) resolveWait()
      else rejectWait(error)
    }
    const check = () => {
      if (list.getSnapshot().byId[sessionId] !== undefined) finish()
    }
    const onAbort = () => finish(abortError())
    const timeout = setTimeout(
      () => finish(new Error(`DSH Session ${sessionId} did not enter the client projection.`)),
      timeoutMs,
    )
    unsubscribe = list.subscribe(check)
    signal.addEventListener('abort', onAbort, { once: true })
    check()
  })
}

interface DraftTask {
  readonly id: string
  readonly objective: string
}

function LearnLoopEntry({ wide, ctx }: { readonly wide: boolean } & {
  readonly ctx: ClientContext
}): JSX.Element {
  const client = createLearnLoopClient(ctx.connection.rpc)
  const [view, setView] = useState<View>('closed')
  const [goals, setGoals] = useState<readonly LongGoalSummary[]>([])
  const [detail, setDetail] = useState<LongGoalStatusProjection | undefined>()
  const [objective, setObjective] = useState('')
  const [tasks, setTasks] = useState<DraftTask[]>([{ id: 'task-row-1', objective: '' }])
  const nextTaskRowId = useRef(1)
  const [maxTaskRounds, setMaxTaskRounds] = useState(3)
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const requestGeneration = useRef(createRequestGeneration())
  const sessionList = useSyncExternalStore(
    listener => ctx.sessions.list.subscribe(listener),
    () => ctx.sessions.list.getSnapshot(),
  )

  const closeOverlay = () => {
    requestGeneration.current.close()
    setLoading(false)
    setView('closed')
  }

  const refresh = useCallback(async () => {
    const request = requestGeneration.current.begin()
    setLoading(true)
    setError(undefined)
    try {
      const nextGoals = await client.list(request.signal)
      if (request.isCurrent()) setGoals(nextGoals)
    } catch (cause) {
      if (request.isCurrent()) {
        setError(cause instanceof Error ? cause.message : 'Unable to refresh Learn Loop plans.')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (view === 'closed') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOverlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view])

  const open = () => {
    setView('list')
    void refresh()
  }

  const openDetail = async (longGoalId: string) => {
    const request = requestGeneration.current.begin()
    setLoading(true)
    setError(undefined)
    try {
      const nextDetail = await client.status(longGoalId, request.signal)
      if (request.isCurrent()) {
        setDetail(nextDetail)
        setView('detail')
      }
    } catch (cause) {
      if (request.isCurrent()) {
        setError(cause instanceof Error ? cause.message : 'Unable to load this Learn Loop plan.')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const createPlan = async () => {
    const trimmedObjective = objective.trim()
    const trimmedTasks = tasks.map(task => task.objective.trim()).filter(Boolean)
    if (trimmedObjective.length === 0 || trimmedTasks.length === 0 || maxTaskRounds < 1) {
      setError('Enter an objective, at least one task, and a positive task-round limit.')
      return
    }
    const request = requestGeneration.current.begin()
    setLoading(true)
    setError(undefined)
    try {
      const nextDetail = await client.create({
        objective: trimmedObjective,
        tasks: trimmedTasks,
        maxTaskRounds,
      }, request.signal)
      if (request.isCurrent()) {
        setDetail(nextDetail)
        setView('detail')
      }
    } catch (cause) {
      if (request.isCurrent()) {
        setError(cause instanceof Error ? cause.message : 'Unable to create the Learn Loop plan.')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const runTask = async () => {
    if (detail === undefined) return
    const action = taskAction(detail, sessionList)
    if (action.disabled) return
    if (action.sessionId !== undefined) {
      closeOverlay()
      ctx.sessions.open(action.sessionId)
      return
    }
    const firstTask = detail.tasks[0]?.id === detail.currentTaskId
    const selectedCwd = firstTask && sessionList.current !== undefined
      ? sessionList.byId[sessionList.current]?.cwd
      : undefined
    const request = requestGeneration.current.begin()
    setLoading(true)
    setError(undefined)
    try {
      const result = await client.runCurrentTask({
        longGoalId: detail.goal.id,
        ...(selectedCwd === undefined ? {} : { initialCwd: selectedCwd }),
      }, request.signal)
      if (result.sessionId !== undefined) {
        await waitForSessionProjection(
          ctx.sessions.list,
          result.sessionId,
          request.signal,
        )
      }
      if (request.isCurrent()) {
        setDetail(result.status)
        if (result.sessionId !== undefined) {
          requestGeneration.current.close()
          setLoading(false)
          setView('closed')
          ctx.sessions.open(result.sessionId)
        }
      }
    } catch (cause) {
      if (request.isCurrent()) {
        setError(cause instanceof Error ? cause.message : 'Unable to run the current task.')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const moveTask = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= tasks.length) return
    setTasks(current => {
      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!]
      return next
    })
  }

  const action = detail === undefined ? undefined : taskAction(detail, sessionList)

  return (
    <>
      <button
        type="button"
        aria-label="Learn Loop"
        title="Learn Loop"
        onClick={open}
        style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, margin: wide ? '0 4px 4px' : '0 0 4px', outlineOffset: 2 }}
      >
        <LoopIcon />
        {wide && 'Learn Loop'}
      </button>
      {view !== 'closed' && (
        <div
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeOverlay()
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--dsw-alias-scrim, color-mix(in srgb, var(--dsw-specific-sidebar-fill) 70%, transparent))', display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <section className="tianwen-learn-loop" role="dialog" aria-modal="true" aria-labelledby="learn-loop-title" style={{ width: 'min(640px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-specific-sidebar-fill)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: 16, fontFamily: 'var(--ds-font-family-text)' }}>
            <style>{`.tianwen-learn-loop button:hover { background: var(--dsw-alias-interactive-bg-hover); } .tianwen-learn-loop button:focus-visible, .tianwen-learn-loop input:focus-visible, .tianwen-learn-loop textarea:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }`}</style>
            <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h2 id="learn-loop-title" style={{ margin: 0, fontSize: 18 }}>Learn Loop</h2>
              <button type="button" aria-label="Close Learn Loop" onClick={closeOverlay} style={buttonStyle}>Close</button>
            </header>
            {error !== undefined && <p role="alert" style={{ color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 10 }}>{error}</p>}
            {loading && <p aria-live="polite">Loading…</p>}
            {view === 'list' && <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>
                <button type="button" onClick={() => void refresh()} style={buttonStyle}>Refresh plans</button>
                <button type="button" onClick={() => setView('create')} style={buttonStyle}>Create plan</button>
              </div>
              {goals.length === 0 && !loading ? <p>No Learn Loop plans yet.</p> : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                  {goals.map(goal => <li key={goal.id}>
                    <button type="button" onClick={() => void openDetail(goal.id)} style={{ ...buttonStyle, width: '100%', textAlign: 'left' }}>
                      <strong>{goal.objective}</strong><br />
                      <span>{goal.completedTasks}/{goal.totalTasks} tasks · {goal.phase}</span>
                    </button>
                  </li>)}
                </ul>
              )}
            </>}
            {view === 'create' && <form onSubmit={event => { event.preventDefault(); void createPlan() }} style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <label>Objective<textarea value={objective} onChange={event => setObjective(event.target.value)} required style={fieldStyle} /></label>
              <label>Maximum rounds per task<input type="number" min="1" value={maxTaskRounds} onChange={event => setMaxTaskRounds(Number(event.target.value))} style={fieldStyle} /></label>
              <fieldset style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }}>
                <legend>Tasks</legend>
                {tasks.map((task, index) => <div key={task.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  <input aria-label={`Task ${index + 1}`} value={task.objective} onChange={event => setTasks(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, objective: event.target.value } : item))} style={{ ...fieldStyle, flex: '1 1 180px' }} />
                  <button type="button" aria-label={`Move task ${index + 1} up`} onClick={() => moveTask(index, -1)} disabled={index === 0} style={buttonStyle}>Up</button>
                  <button type="button" aria-label={`Move task ${index + 1} down`} onClick={() => moveTask(index, 1)} disabled={index === tasks.length - 1} style={buttonStyle}>Down</button>
                  <button type="button" aria-label={`Remove task ${index + 1}`} onClick={() => setTasks(current => current.length === 1 ? current.map(item => ({ ...item, objective: '' })) : current.filter((_, itemIndex) => itemIndex !== index))} style={buttonStyle}>Remove</button>
                </div>)}
                <button type="button" onClick={() => setTasks(current => {
                  nextTaskRowId.current += 1
                  return [...current, { id: `task-row-${nextTaskRowId.current}`, objective: '' }]
                })} style={buttonStyle}>Add task</button>
              </fieldset>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="submit" disabled={loading} style={buttonStyle}>Create plan</button><button type="button" onClick={() => setView('list')} style={buttonStyle}>Back to plans</button></div>
            </form>}
            {view === 'detail' && detail !== undefined && <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <h3 style={{ margin: 0 }}>{detail.goal.objective}</h3>
              <p style={{ margin: 0 }}>{detail.goal.completedTasks}/{detail.goal.totalTasks} tasks complete · {detail.goal.phase}</p>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {detail.tasks.map(task => <li key={task.id}>{task.objective} — {task.phase}{task.blockedReason === undefined ? '' : `: ${task.blockedReason.message}`}</li>)}
              </ol>
              {action?.reason !== undefined && <p role="status" style={{ margin: 0 }}>{action.reason}</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" onClick={() => void runTask()} disabled={loading || action?.disabled !== false} style={buttonStyle}>{action?.label ?? 'Plan complete'}</button>
                <button type="button" onClick={() => setView('list')} style={buttonStyle}>Back to plans</button>
              </div>
            </div>}
          </section>
        </div>
      )}
    </>
  )
}

export const inject = ['slots', 'sessions', 'connection'] as const

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'tianwen-learn-loop',
    order: 20,
  }, props => <LearnLoopEntry {...props} ctx={ctx} />))
}
