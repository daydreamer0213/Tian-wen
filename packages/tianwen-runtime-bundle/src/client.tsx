import { useCallback, useEffect, useState } from 'react'

import type { LongGoalStatusProjection, LongGoalSummary } from './long-goal-contract.js'
import { createLearnLoopClient } from './learn-loop-client.js'

type View = 'closed' | 'list' | 'create' | 'detail'

export interface ClientContext {
  readonly connection: {
    readonly rpc: Parameters<typeof createLearnLoopClient>[0]
  }
  readonly sessions: {
    readonly list: {
      getSnapshot(): {
        readonly current: string | undefined
        readonly byId: Readonly<Record<string, { readonly cwd?: string }>>
      }
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

function taskAction(status: LongGoalStatusProjection): {
  readonly label: 'Start Task' | 'Continue Task' | 'Open Session' | 'Plan complete'
  readonly sessionId?: string
} {
  const task = status.tasks.find(candidate => candidate.id === status.currentTaskId)
  if (task === undefined) return { label: 'Plan complete' }
  if (task.execution !== null && task.phase === 'active') {
    return { label: 'Open Session', sessionId: task.execution.sessionId }
  }
  return { label: task.execution === null ? 'Start Task' : 'Continue Task' }
}

function LearnLoopEntry({ wide, ctx }: { readonly wide: boolean } & {
  readonly ctx: ClientContext
}): JSX.Element {
  const client = createLearnLoopClient(ctx.connection.rpc)
  const [view, setView] = useState<View>('closed')
  const [goals, setGoals] = useState<readonly LongGoalSummary[]>([])
  const [detail, setDetail] = useState<LongGoalStatusProjection | undefined>()
  const [objective, setObjective] = useState('')
  const [tasks, setTasks] = useState<string[]>([''])
  const [maxTaskRounds, setMaxTaskRounds] = useState(3)
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      setGoals(await client.list())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to refresh Learn Loop plans.')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (view === 'closed') return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setView('closed')
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [view])

  const open = () => {
    setView('list')
    void refresh()
  }

  const openDetail = async (longGoalId: string) => {
    setLoading(true)
    setError(undefined)
    try {
      setDetail(await client.status(longGoalId))
      setView('detail')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load this Learn Loop plan.')
    } finally {
      setLoading(false)
    }
  }

  const createPlan = async () => {
    const trimmedObjective = objective.trim()
    const trimmedTasks = tasks.map(task => task.trim()).filter(Boolean)
    if (trimmedObjective.length === 0 || trimmedTasks.length === 0 || maxTaskRounds < 1) {
      setError('Enter an objective, at least one task, and a positive task-round limit.')
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      setDetail(await client.create({
        objective: trimmedObjective,
        tasks: trimmedTasks,
        maxTaskRounds,
      }))
      setView('detail')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the Learn Loop plan.')
    } finally {
      setLoading(false)
    }
  }

  const runTask = async () => {
    if (detail === undefined) return
    const action = taskAction(detail)
    if (action.sessionId !== undefined) {
      ctx.sessions.open(action.sessionId)
      return
    }
    const firstTask = detail.tasks[0]?.id === detail.currentTaskId
    const sessionList = ctx.sessions.list.getSnapshot()
    const selectedCwd = firstTask && sessionList.current !== undefined
      ? sessionList.byId[sessionList.current]?.cwd
      : undefined
    setLoading(true)
    setError(undefined)
    try {
      const result = await client.runCurrentTask({
        longGoalId: detail.goal.id,
        ...(selectedCwd === undefined ? {} : { initialCwd: selectedCwd }),
      })
      setDetail(result.status)
      if (result.sessionId !== undefined) {
        ctx.sessions.open(result.sessionId)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to run the current task.')
    } finally {
      setLoading(false)
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
            if (event.target === event.currentTarget) setView('closed')
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--dsw-alias-scrim, color-mix(in srgb, var(--dsw-specific-sidebar-fill) 70%, transparent))', display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <section className="tianwen-learn-loop" role="dialog" aria-modal="true" aria-labelledby="learn-loop-title" style={{ width: 'min(640px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-specific-sidebar-fill)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: 16, fontFamily: 'var(--ds-font-family-text)' }}>
            <style>{`.tianwen-learn-loop button:hover { background: var(--dsw-alias-interactive-bg-hover); } .tianwen-learn-loop button:focus-visible, .tianwen-learn-loop input:focus-visible, .tianwen-learn-loop textarea:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }`}</style>
            <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h2 id="learn-loop-title" style={{ margin: 0, fontSize: 18 }}>Learn Loop</h2>
              <button type="button" aria-label="Close Learn Loop" onClick={() => setView('closed')} style={buttonStyle}>Close</button>
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
                {tasks.map((task, index) => <div key={`${index}-${task}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  <input aria-label={`Task ${index + 1}`} value={task} onChange={event => setTasks(current => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} style={{ ...fieldStyle, flex: '1 1 180px' }} />
                  <button type="button" aria-label={`Move task ${index + 1} up`} onClick={() => moveTask(index, -1)} disabled={index === 0} style={buttonStyle}>Up</button>
                  <button type="button" aria-label={`Move task ${index + 1} down`} onClick={() => moveTask(index, 1)} disabled={index === tasks.length - 1} style={buttonStyle}>Down</button>
                  <button type="button" aria-label={`Remove task ${index + 1}`} onClick={() => setTasks(current => current.length === 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index))} style={buttonStyle}>Remove</button>
                </div>)}
                <button type="button" onClick={() => setTasks(current => [...current, ''])} style={buttonStyle}>Add task</button>
              </fieldset>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="submit" disabled={loading} style={buttonStyle}>Create plan</button><button type="button" onClick={() => setView('list')} style={buttonStyle}>Back to plans</button></div>
            </form>}
            {view === 'detail' && detail !== undefined && <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <h3 style={{ margin: 0 }}>{detail.goal.objective}</h3>
              <p style={{ margin: 0 }}>{detail.goal.completedTasks}/{detail.goal.totalTasks} tasks complete · {detail.goal.phase}</p>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {detail.tasks.map(task => <li key={task.id}>{task.objective} — {task.phase}{task.blockedReason === undefined ? '' : `: ${task.blockedReason.message}`}</li>)}
              </ol>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" onClick={() => void runTask()} disabled={loading || taskAction(detail).label === 'Plan complete'} style={buttonStyle}>{taskAction(detail).label}</button>
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
