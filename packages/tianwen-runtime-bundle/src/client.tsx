import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type {
  AnyLongGoalStatusProjection,
  AnyLongGoalSummary,
  LongGoalStatusProjection,
  LongGoalStatusProjectionV2,
} from './long-goal-contract.js'
import { createLearnLoopClient, LearnLoopRpcError } from './learn-loop-client.js'
import type { LearningAuditItem } from './learning-clue-status.js'

type View = 'closed' | 'list' | 'create' | 'detail'

const LOCALE_NAMESPACE = 'tianwen.learn-loop'

const zhMessages = {
  'entry.title': '长期目标',
  'entry.closeLabel': '关闭长期目标',
  'common.close': '关闭',
  'common.loading': '加载中…',
  'list.refresh': '刷新长期目标',
  'list.create': '创建目标',
  'audit.title': '高级审计（只读）',
  'audit.empty': '还没有可显示的学习审计记录。',
  'learning.title': '学习状态',
  'learning.unavailable': '学习状态暂不可用，连接恢复后自动更新；不能据此判定已完成。',
  'learning.phase.pending-parent': '等待主对话恢复',
  'learning.phase.running': '分析中',
  'learning.phase.candidate-ready': '验证中',
  'learning.phase.shadow-ready': '启用验证中',
  'learning.phase.failed': '暂时中断',
  'learning.phase.no-case': '无需改进',
  'learning.phase.insufficient-evidence': '证据不足，未启用',
  'learning.phase.protocol-unavailable': '当前场景尚不支持验证',
  'learning.phase.candidate-rejected': '评估未通过',
  'learning.phase.promoted': '已验证启用',
  'learning.phase.rolled-back': '已回滚',
  'learning.phase.transition-recovered': '切换异常已恢复',
  'learning.phase.invalidated': '已停止',
  'list.empty': '还没有长期目标。',
  'list.empty.step1': '在 DSH 中打开或创建一个项目工作区。',
  'list.empty.step2': '创建一个长期目标，天问会规划并推进后续任务。',
  'list.empty.step3': '可随时补充信息或调整方向。',
  'list.summary': '{completed}/{total} 个任务 · {phase}',
  'form.goal': '目标',
  'form.context': '背景（可选）',
  'form.successCriteria': '成功标准（可选）',
  'form.startProgressing': '开始推进',
  'form.back': '返回',
  'detail.summary': '已完成 {completed}/{total} 个任务 · {phase}',
  'detail.planOwnership': '以下步骤由天问根据目标自动规划；你只需继续当前工作或补充方向。',
  'detail.continuousOwnership': '这里只显示历史；请回到原始 DSH 对话，通过自然语言继续、调整或暂停。',
  'detail.currentWork': '当前工作',
  'detail.completedWork': '已完成',
  'detail.nextSteps': '接下来',
  'detail.abandonedWork': '已放弃',
  'detail.planningNext': '等待继续规划或更新下一步。',
  'detail.goalComplete': '长期目标已完成。',
  'detail.noCurrentWork': '当前没有正在执行的工作。',
  'detail.guidance': '补充信息或调整方向',
  'detail.guidanceLabel': '补充信息',
  'action.continueProgress': '继续推进',
  'action.continuePlanning': '继续规划',
  'action.startNext': '开始下一步',
  'action.continueCurrent': '继续当前工作',
  'action.addGuidance': '提交补充信息',
  'action.abandon': '放弃当前任务并重新规划',
  'action.start': '开始任务',
  'action.continue': '继续任务',
  'action.openSession': '打开会话',
  'action.planComplete': '长期任务已完成',
  'reason.sessionUnavailable': '已绑定的 DSH 会话不可用。',
  'reason.goalMismatch': '已绑定的 DSH 会话目标与当前任务不匹配。',
  'reason.taskBlocked': '当前任务已被阻塞，无法继续。',
  'reason.goalNotResumable': '已绑定的 DSH 会话目标无法继续。',
  'reason.workspaceRequired': '请先打开或创建一个 DSH 工作区。',
  'error.refresh': '无法刷新长期目标。',
  'error.load': '无法加载该长期目标。',
  'error.goalValidation': '请填写目标，并先选择一个 DSH 工作区会话。',
  'error.create': '无法创建长期目标。',
  'error.run': '无法执行当前任务。',
  'error.guidance': '无法提交补充信息。',
  'error.abandon': '无法放弃当前任务。',
  'error.analysis': '无法开始分析。',
  'error.revisionConflict': '该目标已在其他位置发生变化，已显示最新状态。请确认后重试。',
  'phase.planning': '规划中',
  'phase.abandoned': '已放弃',
  'phase.pending': '待执行',
  'phase.active': '执行中',
  'phase.paused': '已暂停',
  'phase.blocked': '已阻塞',
  'phase.complete': '已完成',
} as const

type MessageKey = keyof typeof zhMessages
type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string

const enMessages = {
  'entry.title': 'Learn Loop',
  'entry.closeLabel': 'Close Learn Loop',
  'common.close': 'Close',
  'common.loading': 'Loading…',
  'list.refresh': 'Refresh plans',
  'list.create': 'Create Goal',
  'audit.title': 'Advanced audit (read-only)',
  'audit.empty': 'No learning audit records are available yet.',
  'learning.title': 'Learning status',
  'learning.unavailable': 'Learning status unavailable. Updates resume after reconnect; completion is not confirmed.',
  'learning.phase.pending-parent': 'Waiting for main chat',
  'learning.phase.running': 'Analyzing',
  'learning.phase.candidate-ready': 'Validating',
  'learning.phase.shadow-ready': 'Verifying activation',
  'learning.phase.failed': 'Interrupted',
  'learning.phase.no-case': 'No change needed',
  'learning.phase.insufficient-evidence': 'Insufficient evidence; not activated',
  'learning.phase.protocol-unavailable': 'Validation unavailable for this task',
  'learning.phase.candidate-rejected': 'Evaluation not passed',
  'learning.phase.promoted': 'Activation verified',
  'learning.phase.rolled-back': 'Rolled back',
  'learning.phase.transition-recovered': 'Transition recovered',
  'learning.phase.invalidated': 'Stopped',
  'list.empty': 'No Learn Loop plans yet.',
  'list.empty.step1': 'Open or create a project workspace in DSH.',
  'list.empty.step2': 'Create a long-term Goal; Tianwen will plan and progress the Tasks.',
  'list.empty.step3': 'Add information or adjust direction at any time.',
  'list.summary': '{completed}/{total} tasks · {phase}',
  'form.goal': 'Goal',
  'form.context': 'Context (optional)',
  'form.successCriteria': 'Success criteria (optional)',
  'form.startProgressing': 'Start progressing',
  'form.back': 'Back',
  'detail.summary': '{completed}/{total} tasks complete · {phase}',
  'detail.planOwnership': 'Tianwen planned these steps from your Goal. You only need to continue the current work or add guidance.',
  'detail.continuousOwnership': 'This is history only. Return to the original DSH conversation to continue, redirect, or pause naturally.',
  'detail.currentWork': 'Current work',
  'detail.completedWork': 'Completed',
  'detail.nextSteps': 'Next steps',
  'detail.abandonedWork': 'Abandoned',
  'detail.planningNext': 'Waiting to plan or update the next steps.',
  'detail.goalComplete': 'The long-term Goal is complete.',
  'detail.noCurrentWork': 'No work is currently running.',
  'detail.guidance': 'Add information / adjust direction',
  'detail.guidanceLabel': 'Guidance',
  'action.continueProgress': 'Continue progress',
  'action.continuePlanning': 'Continue planning',
  'action.startNext': 'Start next step',
  'action.continueCurrent': 'Continue current work',
  'action.addGuidance': 'Add guidance',
  'action.abandon': 'Abandon this Task and replan',
  'action.start': 'Start Task',
  'action.continue': 'Continue Task',
  'action.openSession': 'Open Session',
  'action.planComplete': 'Plan complete',
  'reason.sessionUnavailable': 'The bound DSH Session is not available.',
  'reason.goalMismatch': 'The bound DSH Session Goal does not match this Task.',
  'reason.taskBlocked': 'This Task is blocked and cannot be continued.',
  'reason.goalNotResumable': 'The bound DSH Session Goal is not resumable.',
  'reason.workspaceRequired': 'Open or create a DSH Workspace first.',
  'error.refresh': 'Unable to refresh Learn Loop plans.',
  'error.load': 'Unable to load this Learn Loop plan.',
  'error.goalValidation': 'Enter a Goal and select a DSH Workspace Session first.',
  'error.create': 'Unable to create the Learn Loop plan.',
  'error.run': 'Unable to run the current task.',
  'error.guidance': 'Unable to add guidance.',
  'error.abandon': 'Unable to abandon the current Task.',
  'error.analysis': 'Unable to start analysis.',
  'error.revisionConflict': 'This Goal changed elsewhere. The latest status is shown; review it before retrying.',
  'phase.planning': 'planning',
  'phase.abandoned': 'abandoned',
  'phase.pending': 'pending',
  'phase.active': 'active',
  'phase.paused': 'paused',
  'phase.blocked': 'blocked',
  'phase.complete': 'complete',
} as const satisfies Readonly<Record<MessageKey, string>>

const actionLabelKeys = {
  'Start Task': 'action.start',
  'Continue Task': 'action.continue',
  'Open Session': 'action.openSession',
  'Plan complete': 'action.planComplete',
} as const satisfies Readonly<Record<string, MessageKey>>

const fixedReasonKeys: Readonly<Record<string, MessageKey>> = {
  'The bound DSH Session is not available.': 'reason.sessionUnavailable',
  'The bound DSH Session Goal does not match this Task.': 'reason.goalMismatch',
  'This Task is blocked and cannot be continued.': 'reason.taskBlocked',
  'The bound DSH Session Goal is not resumable.': 'reason.goalNotResumable',
  'Open or create a DSH Workspace first.': 'reason.workspaceRequired',
}

const phaseKeys: Readonly<Record<string, MessageKey>> = {
  planning: 'phase.planning',
  pending: 'phase.pending',
  active: 'phase.active',
  paused: 'phase.paused',
  blocked: 'phase.blocked',
  complete: 'phase.complete',
  abandoned: 'phase.abandoned',
}

type VisibleError =
  | { readonly key: MessageKey }
  | { readonly message: string }

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
  readonly locale: {
    register(
      namespace: string,
      locale: string,
      dictionary: Readonly<Record<string, string>>,
    ): () => void
    bind(
      namespace: string,
    ): (key: string, params?: Readonly<Record<string, string | number>>) => string
    getSnapshot(): { readonly active: 'zh' | 'en', readonly revision: number }
    subscribe(listener: () => void): () => void
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
      name: 'sidebar.footer.action' | 'conversation.input.dock',
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
    register(
      options: { readonly name: 'conversation.input.dock'; readonly id: 'tianwen-learning-status'; readonly order: 20 },
      component: (props: { readonly session: { readonly sessionId: string } }) => JSX.Element,
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

function translatePhase(t: Translate, phase: string): string {
  const key = phaseKeys[phase]
  return key === undefined ? phase : t(key)
}

function translateActionReason(
  t: Translate,
  reason: string,
  status: LongGoalStatusProjection,
  sessions: SessionListSnapshot,
): string {
  const task = status.tasks.find(candidate => candidate.id === status.currentTaskId)
  const projectedGoal = task?.execution === null || task?.execution === undefined
    ? undefined
    : sessions.byId[task.execution.sessionId]?.projectionValues?.goal?.goal
  const dynamicBlockedReason = task?.blockedReason?.message ?? projectedGoal?.blockedReason?.message
  if (reason === dynamicBlockedReason) return reason
  const key = fixedReasonKeys[reason]
  return key === undefined ? reason : t(key)
}

function translateError(t: Translate, error: VisibleError): string {
  return 'key' in error ? t(error.key) : error.message
}

function goalFirstActionLabel(status: LongGoalStatusProjectionV2): MessageKey {
  if (status.goal.phase === 'planning') return 'action.continuePlanning'
  const current = status.tasks.find(task => task.id === status.currentTaskId)
  if (current?.phase === 'active' || current?.phase === 'paused') {
    return 'action.continueCurrent'
  }
  if (status.goal.phase === 'active' && current?.phase === 'pending') return 'action.startNext'
  return 'action.continueProgress'
}

function GoalTaskGroup({
  label,
  tasks,
  t,
}: {
  readonly label: string
  readonly tasks: LongGoalStatusProjectionV2['tasks']
  readonly t: Translate
}): JSX.Element | null {
  if (tasks.length === 0) return null
  return (
    <section aria-label={label}>
      <h4 style={{ margin: '4px 0' }}>{label}</h4>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {tasks.map(task => <li key={task.id}>
          {task.objective} — {translatePhase(t, task.phase)}
          {task.blockedReason === undefined ? '' : `: ${task.blockedReason.message}`}
        </li>)}
      </ul>
    </section>
  )
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

function LearnLoopEntry({ wide, ctx }: { readonly wide: boolean } & {
  readonly ctx: ClientContext
}): JSX.Element {
  useSyncExternalStore(
    listener => ctx.locale.subscribe(listener),
    () => ctx.locale.getSnapshot(),
  )
  const t = ctx.locale.bind(LOCALE_NAMESPACE)
  const client = createLearnLoopClient(ctx.connection.rpc)
  const [view, setView] = useState<View>('closed')
  const [goals, setGoals] = useState<readonly AnyLongGoalSummary[]>([])
  const [audit, setAudit] = useState<readonly LearningAuditItem[]>([])
  const [detail, setDetail] = useState<AnyLongGoalStatusProjection | undefined>()
  const [objective, setObjective] = useState('')
  const [context, setContext] = useState('')
  const [successCriteria, setSuccessCriteria] = useState('')
  const [guidance, setGuidance] = useState('')
  const [operationSessionId, setOperationSessionId] = useState<string | undefined>()
  const [error, setError] = useState<VisibleError | undefined>()
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
      const [nextGoals, nextAudit] = await Promise.all([
        client.list(request.signal),
        client.learningAudit(request.signal),
      ])
      if (request.isCurrent()) {
        setGoals(nextGoals)
        setAudit(nextAudit.items)
      }
    } catch (cause) {
      if (request.isCurrent()) {
        setError(cause instanceof Error ? { message: cause.message } : { key: 'error.refresh' })
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }, [client])

  const backToList = () => {
    requestGeneration.current.close()
    setLoading(false)
    setView('list')
    void refresh()
  }

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
        setGuidance('')
        setOperationSessionId(undefined)
        setView('detail')
      }
    } catch (cause) {
      if (request.isCurrent()) {
        setError(cause instanceof Error ? { message: cause.message } : { key: 'error.load' })
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const openReturnedSession = async (sessionId: string, request: RequestHandle): Promise<void> => {
    await waitForSessionProjection(ctx.sessions.list, sessionId, request.signal)
    if (!request.isCurrent()) return
    closeOverlay()
    ctx.sessions.open(sessionId)
  }

  const createPlan = async () => {
    const trimmedObjective = objective.trim()
    const selectedSessionId = sessionList.current !== undefined &&
      sessionList.byId[sessionList.current]?.cwd?.trim()
      ? sessionList.current
      : undefined
    if (trimmedObjective.length === 0 || selectedSessionId === undefined) {
      setError({ key: 'error.goalValidation' })
      return
    }
    const request = requestGeneration.current.begin()
    setLoading(true)
    setError(undefined)
    try {
      const result = await client.createGoalFirst({
        objective: trimmedObjective,
        context: context.trim() || null,
        successCriteria: successCriteria.trim() || null,
        workspaceSessionId: selectedSessionId,
      }, request.signal)
      if (request.isCurrent()) {
        setDetail(result.status)
        setGuidance('')
        setOperationSessionId(result.sessionId ?? undefined)
        setView('detail')
      }
      if (result.sessionId !== null) await openReturnedSession(result.sessionId, request)
    } catch (cause) {
      if (request.isCurrent()) {
        setError(cause instanceof Error ? { message: cause.message } : { key: 'error.create' })
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const runTask = async () => {
    if (detail === undefined || detail.schemaVersion !== 'tianwen.long-goal-status.v1') return
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
        setError(cause instanceof Error ? { message: cause.message } : { key: 'error.run' })
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const handleMutationFailure = async (
    cause: unknown,
    request: RequestHandle,
    failedDetail: LongGoalStatusProjectionV2,
    fallback: MessageKey,
  ): Promise<void> => {
    if (cause instanceof LearnLoopRpcError && cause.code === 'revision-conflict') {
      try {
        const latest = await client.status(failedDetail.goal.id, request.signal)
        if (request.isCurrent()) {
          setDetail(latest)
          setOperationSessionId(undefined)
          setError({ key: 'error.revisionConflict' })
        }
      } catch (refreshCause) {
        if (request.isCurrent()) {
          setError(refreshCause instanceof Error
            ? { message: refreshCause.message }
            : { key: 'error.load' })
        }
      }
      return
    }
    if (request.isCurrent()) {
      setError(cause instanceof Error ? { message: cause.message } : { key: fallback })
    }
  }

  const continueProgress = async () => {
    if (detail === undefined || detail.schemaVersion !== 'tianwen.long-goal-status.v2') return
    const failedDetail = detail
    const request = requestGeneration.current.begin()
    setLoading(true)
    setError(undefined)
    try {
      const result = await client.continueProgress({
        longGoalId: failedDetail.goal.id,
        expectedRevision: failedDetail.goal.revision,
      }, request.signal)
      if (request.isCurrent()) {
        setDetail(result.status)
        setOperationSessionId(result.sessionId ?? undefined)
      }
      if (result.sessionId !== null) await openReturnedSession(result.sessionId, request)
    } catch (cause) {
      await handleMutationFailure(cause, request, failedDetail, 'error.run')
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const addGuidance = async () => {
    if (detail === undefined || detail.schemaVersion !== 'tianwen.long-goal-status.v2') return
    const text = guidance.trim()
    if (text.length === 0) return
    const failedDetail = detail
    const request = requestGeneration.current.begin()
    setLoading(true)
    setError(undefined)
    try {
      const result = await client.addGuidance({
        longGoalId: failedDetail.goal.id,
        expectedRevision: failedDetail.goal.revision,
        text,
      }, request.signal)
      if (request.isCurrent()) {
        setDetail(result.status)
        setGuidance('')
        setOperationSessionId(undefined)
      }
    } catch (cause) {
      await handleMutationFailure(cause, request, failedDetail, 'error.guidance')
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const abandonCurrentTask = async () => {
    if (detail === undefined || detail.schemaVersion !== 'tianwen.long-goal-status.v2') return
    const failedDetail = detail
    const request = requestGeneration.current.begin()
    setLoading(true)
    setError(undefined)
    try {
      const result = await client.abandonCurrentTask({
        longGoalId: failedDetail.goal.id,
        expectedRevision: failedDetail.goal.revision,
      }, request.signal)
      if (request.isCurrent()) {
        setDetail(result.status)
        setOperationSessionId(undefined)
      }
    } catch (cause) {
      await handleMutationFailure(cause, request, failedDetail, 'error.abandon')
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const openBoundSession = async (sessionId: string) => {
    const request = requestGeneration.current.begin()
    setLoading(true)
    setError(undefined)
    try {
      await waitForSessionProjection(ctx.sessions.list, sessionId, request.signal)
      if (request.isCurrent()) {
        closeOverlay()
        ctx.sessions.open(sessionId)
      }
    } catch (cause) {
      if (request.isCurrent()) {
        setError(cause instanceof Error ? { message: cause.message } : { key: 'error.run' })
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }

  const action = detail?.schemaVersion === 'tianwen.long-goal-status.v1'
    ? taskAction(detail, sessionList)
    : undefined
  const goalFirstDetail = detail?.schemaVersion === 'tianwen.long-goal-status.v2' ||
    detail?.schemaVersion === 'tianwen.long-goal-status.v3'
    ? detail
    : undefined
  const goalFirstCurrentTask = goalFirstDetail?.tasks.find(task =>
    task.id === goalFirstDetail.currentTaskId)
  const goalFirstVisibleCurrentTask = goalFirstDetail !== undefined &&
    (goalFirstDetail.goal.phase === 'active' || goalFirstDetail.goal.phase === 'blocked')
    ? goalFirstCurrentTask
    : undefined
  const goalFirstCompletedTasks = goalFirstDetail?.tasks.filter(task => task.phase === 'complete')
    ?? []
  const goalFirstNextTasks = goalFirstDetail?.tasks.filter(task =>
    task.phase === 'pending' && task.id !== goalFirstVisibleCurrentTask?.id)
    ?? []
  const goalFirstAbandonedTasks = goalFirstDetail?.tasks.filter(task => task.phase === 'abandoned')
    ?? []
  const goalFirstSessionId = operationSessionId ?? goalFirstCurrentTask?.execution?.sessionId
  const canAbandon = detail?.schemaVersion === 'tianwen.long-goal-status.v2' &&
    goalFirstCurrentTask?.phase === 'blocked' && goalFirstCurrentTask.execution !== null &&
    goalFirstCurrentTask.resolution === null
  const selectedWorkspaceSession = sessionList.current !== undefined &&
    Boolean(sessionList.byId[sessionList.current]?.cwd?.trim())

  return (
    <>
      <button
        type="button"
        aria-label={t('entry.title')}
        title={t('entry.title')}
        onClick={open}
        style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, margin: wide ? '0 4px 4px' : '0 0 4px', outlineOffset: 2 }}
      >
        <LoopIcon />
        {wide && t('entry.title')}
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
              <h2 id="learn-loop-title" style={{ margin: 0, fontSize: 18 }}>{t('entry.title')}</h2>
              <button type="button" aria-label={t('entry.closeLabel')} onClick={closeOverlay} style={buttonStyle}>{t('common.close')}</button>
            </header>
            {error !== undefined && <p role="alert" style={{ color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 10 }}>{translateError(t, error)}</p>}
            {loading && <p aria-live="polite">{t('common.loading')}</p>}
            {view === 'list' && <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>
                <button type="button" onClick={() => void refresh()} style={buttonStyle}>{t('list.refresh')}</button>
                <button type="button" onClick={() => setView('create')} style={buttonStyle}>{t('list.create')}</button>
              </div>
              {goals.length === 0 && !loading ? <div>
                <p>{t('list.empty')}</p>
                <ol>
                  <li>{t('list.empty.step1')}</li>
                  <li>{t('list.empty.step2')}</li>
                  <li>{t('list.empty.step3')}</li>
                </ol>
              </div> : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                  {goals.map(goal => <li key={goal.id}>
                    <button type="button" onClick={() => void openDetail(goal.id)} style={{ ...buttonStyle, width: '100%', textAlign: 'left' }}>
                      <strong>{goal.objective}</strong><br />
                      <span>{t('list.summary', {
                        completed: goal.completedTasks,
                        total: goal.totalTasks,
                        phase: translatePhase(t, 'schemaVersion' in goal &&
                          goal.schemaVersion === 'tianwen.long-goal-summary.v3' &&
                          goal.control.autoProgress === 'paused' && goal.phase !== 'blocked' &&
                          goal.phase !== 'complete' ? 'paused' : goal.phase),
                      })}</span>
                    </button>
                  </li>)}
                </ul>
              )}
              <details style={{ marginTop: 16 }}>
                <summary>{t('audit.title')}</summary>
                {audit.length === 0 ? <p>{t('audit.empty')}</p> : <ul>
                  {audit.map(item => <li key={item.analysisId}>
                    <code>{item.analysisId}</code> — {item.phase} — <time dateTime={item.updatedAt}>{item.updatedAt}</time>
                    {item.evidenceDigests.length > 0 && <div>{item.evidenceDigests.join(', ')}</div>}
                    {item.recovery !== null && <div>{item.recovery.resumePhase}</div>}
                  </li>)}
                </ul>}
              </details>
            </>}
            {view === 'create' && <form onSubmit={event => { event.preventDefault(); void createPlan() }} style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <label>{t('form.goal')}<textarea value={objective} onChange={event => setObjective(event.target.value)} required style={fieldStyle} /></label>
              <label>{t('form.context')}<textarea value={context} onChange={event => setContext(event.target.value)} style={fieldStyle} /></label>
              <label>{t('form.successCriteria')}<textarea value={successCriteria} onChange={event => setSuccessCriteria(event.target.value)} style={fieldStyle} /></label>
              {!selectedWorkspaceSession && <p role="status" style={{ margin: 0 }}>{t('reason.workspaceRequired')}</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="submit" disabled={loading || !selectedWorkspaceSession} style={buttonStyle}>{t('form.startProgressing')}</button><button type="button" onClick={backToList} style={buttonStyle}>{t('form.back')}</button></div>
            </form>}
            {view === 'detail' && detail !== undefined && <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <h3 style={{ margin: 0 }}>{detail.goal.objective}</h3>
              <p style={{ margin: 0 }}>{t('detail.summary', {
                completed: detail.goal.completedTasks,
                total: detail.goal.totalTasks,
                phase: translatePhase(t, detail.schemaVersion === 'tianwen.long-goal-status.v3' &&
                  detail.control.autoProgress === 'paused' && detail.goal.phase !== 'blocked' &&
                  detail.goal.phase !== 'complete' ? 'paused' : detail.goal.phase),
              })}</p>
              {detail.schemaVersion === 'tianwen.long-goal-status.v1' ? <>
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {detail.tasks.map(task => <li key={task.id}>{task.objective} — {translatePhase(t, task.phase)}{task.blockedReason === undefined ? '' : `: ${task.blockedReason.message}`}</li>)}
                </ol>
                {action?.reason !== undefined && <p role="status" style={{ margin: 0 }}>{translateActionReason(t, action.reason, detail, sessionList)}</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" onClick={() => void runTask()} disabled={loading || action?.disabled !== false} style={buttonStyle}>{t(actionLabelKeys[action?.label ?? 'Plan complete'])}</button>
                  <button type="button" onClick={backToList} style={buttonStyle}>{t('form.back')}</button>
                </div>
              </> : <>
                {detail.goal.context !== null && <p style={{ margin: 0 }}>{detail.goal.context}</p>}
                {detail.goal.successCriteria !== null && <p style={{ margin: 0 }}>{detail.goal.successCriteria}</p>}
                <p style={{ margin: 0 }}>{t(detail.schemaVersion === 'tianwen.long-goal-status.v3'
                  ? 'detail.continuousOwnership'
                  : 'detail.planOwnership')}</p>
                <section aria-label={t('detail.currentWork')}>
                  <h4 style={{ margin: '4px 0' }}>{t('detail.currentWork')}</h4>
                  {goalFirstVisibleCurrentTask === undefined
                    ? <p style={{ margin: 0 }}>{t(detail.goal.phase === 'planning'
                      ? 'detail.planningNext'
                      : detail.goal.phase === 'complete'
                        ? 'detail.goalComplete'
                        : 'detail.noCurrentWork')}</p>
                    : <ul style={{ margin: 0, paddingLeft: 20 }}><li>
                      {goalFirstVisibleCurrentTask.objective} — {translatePhase(t, goalFirstVisibleCurrentTask.phase)}
                      {goalFirstVisibleCurrentTask.blockedReason === undefined ? '' : `: ${goalFirstVisibleCurrentTask.blockedReason.message}`}
                    </li></ul>}
                </section>
                <GoalTaskGroup label={t('detail.completedWork')} tasks={goalFirstCompletedTasks} t={t} />
                <GoalTaskGroup label={t('detail.nextSteps')} tasks={goalFirstNextTasks} t={t} />
                <GoalTaskGroup label={t('detail.abandonedWork')} tasks={goalFirstAbandonedTasks} t={t} />
                {detail.guidance.length > 0 && <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {detail.guidance.map((item, index) => <li key={index}>{item}</li>)}
                </ul>}
                {detail.schemaVersion === 'tianwen.long-goal-status.v2' && <label>{t('detail.guidance')}
                  <textarea aria-label={t('detail.guidanceLabel')} value={guidance} onChange={event => setGuidance(event.target.value)} style={fieldStyle} />
                </label>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {detail.schemaVersion === 'tianwen.long-goal-status.v2' &&
                    (detail.goal.phase === 'planning' || detail.goal.phase === 'active') &&
                    <button type="button" onClick={() => void continueProgress()} disabled={loading} style={buttonStyle}>{t(goalFirstActionLabel(detail))}</button>}
                  {detail.schemaVersion === 'tianwen.long-goal-status.v2' &&
                    <button type="button" onClick={() => void addGuidance()} disabled={loading || guidance.trim().length === 0} style={buttonStyle}>{t('action.addGuidance')}</button>}
                  {goalFirstSessionId !== undefined && <button type="button" onClick={() => void openBoundSession(goalFirstSessionId)} disabled={loading} style={buttonStyle}>{t('action.openSession')}</button>}
                  {detail.schemaVersion === 'tianwen.long-goal-status.v2' && canAbandon &&
                    <button type="button" onClick={() => void abandonCurrentTask()} disabled={loading} style={buttonStyle}>{t('action.abandon')}</button>}
                  <button type="button" onClick={backToList} style={buttonStyle}>{t('form.back')}</button>
                </div>
              </>}
            </div>}
          </section>
        </div>
      )}
    </>
  )
}

/** Read-only live status in DSH's additive main-chat seat; no model or control RPC. */
function LearningStatus({ ctx, sessionId }: { readonly ctx: ClientContext; readonly sessionId: string }): JSX.Element | null {
  const locale = useSyncExternalStore(ctx.locale.subscribe.bind(ctx.locale), ctx.locale.getSnapshot.bind(ctx.locale))
  const t = ctx.locale.bind(LOCALE_NAMESPACE)
  const [snapshot, setSnapshot] = useState<{
    readonly sessionId: string
    readonly items: readonly LearningAuditItem[]
    readonly unavailable: boolean
  } | undefined>(undefined)
  useEffect(() => {
    const lifetime = new AbortController()
    const client = createLearnLoopClient(ctx.connection.rpc)
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try {
        const audit = await client.learningAudit(
          AbortSignal.any([lifetime.signal, AbortSignal.timeout(10_000)]), sessionId,
        )
        if (!lifetime.signal.aborted) setSnapshot({ sessionId, items: audit.items, unavailable: false })
      } catch {
        if (!lifetime.signal.aborted) setSnapshot({ sessionId, items: [], unavailable: true })
      } finally {
        // One read at a time, only while this main-chat seat is mounted.
        if (!lifetime.signal.aborted) timer = setTimeout(refresh, 2_000)
      }
    }
    void refresh()
    return () => { lifetime.abort(); clearTimeout(timer) }
  }, [ctx, sessionId])
  if (snapshot?.sessionId !== sessionId) return null
  const counts = new Map<string, number>()
  for (const item of snapshot.items) counts.set(item.phase, (counts.get(item.phase) ?? 0) + 1)
  if (!snapshot.unavailable && counts.size === 0) return null
  const order = ['pending-parent', 'running', 'candidate-ready', 'shadow-ready', 'failed']
  const phases = [...counts].sort(([left], [right]) => {
    const rank = (phase: string) => order.includes(phase) ? order.indexOf(phase) : order.length
    return rank(left) - rank(right)
  })
  return <div role="status" aria-live="polite" lang={locale.active} style={{
    display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '6px 10px',
    color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: 1.5,
    background: 'var(--dsw-alias-button-elevated-fill)',
    borderLeft: '2px solid var(--dsw-alias-border-l2)',
  }}>
    {snapshot.unavailable ? t('learning.unavailable') : <>
      <span>{t('learning.title')}</span>
      {phases.map(([phase, count]) => <span key={phase}>{t(`learning.phase.${phase}`)} · {count}</span>)}
    </>}
  </div>
}

export const inject = ['slots', 'sessions', 'connection', 'locale'] as const

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'tianwen-learning-status', order: 20,
  }, props => <LearningStatus ctx={ctx} sessionId={props.session.sessionId} />))
  ctx.slots.inject('sidebar.footer.action', () => {
    const unregisterZh = ctx.locale.register(LOCALE_NAMESPACE, 'zh', zhMessages)
    const unregisterEn = ctx.locale.register(LOCALE_NAMESPACE, 'en', enMessages)
    const unregisterSlot = ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'tianwen-learn-loop',
      order: 20,
    }, props => <LearnLoopEntry {...props} ctx={ctx} />)
    return () => {
      unregisterSlot()
      unregisterEn()
      unregisterZh()
    }
  })
}
