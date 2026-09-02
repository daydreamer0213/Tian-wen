import { describe, expect, it, vi } from 'vitest'

import { createLearnLoopClient } from '../../packages/tianwen-runtime-bundle/src/learn-loop-client.js'
import {
  apply,
  createRequestGeneration,
  inject,
} from '../../packages/tianwen-runtime-bundle/src/client.js'

const status = {
  schemaVersion: 'tianwen.long-goal-status.v1',
  goal: {
    id: 'tianwen-long-goal-1',
    objective: 'Ship the Learn Loop entry',
    phase: 'active',
    completedTasks: 0,
    totalTasks: 2,
  },
  tasks: [{
    id: 'task-1',
    objective: 'Add the browser entry',
    phase: 'pending',
    execution: null,
  }],
  currentTaskId: 'task-1',
  runtime: {
    activation: 'not-loaded',
    modelRequests: 0,
    readOnly: true,
  },
} as const

const statusV2 = {
  schemaVersion: 'tianwen.long-goal-status.v2',
  goal: {
    id: 'tianwen-long-goal-v2',
    objective: 'Ship goal-first Learn Loop',
    context: 'Use the selected workspace',
    successCriteria: 'The first Task is admitted',
    phase: 'active',
    revision: 4,
    completedTasks: 0,
    abandonedTasks: 0,
    totalTasks: 2,
  },
  planner: {
    sessionId: 'planner-session',
    phase: 'ready',
    planRevision: 1,
  },
  guidance: [],
  tasks: [{
    id: 'task-v2-1',
    objective: 'Implement the default flow',
    phase: 'active',
    execution: { goalId: 'goal-v2-1', sessionId: 'task-session' },
    resolution: null,
  }, {
    id: 'task-v2-2',
    objective: 'Verify compatibility',
    phase: 'pending',
    execution: null,
    resolution: null,
  }],
  currentTaskId: 'task-v2-1',
  runtime: {
    activation: 'not-loaded',
    modelRequests: 0,
    readOnly: true,
  },
} as const

const summaryV1 = {
  id: status.goal.id,
  objective: status.goal.objective,
  phase: status.goal.phase,
  completedTasks: status.goal.completedTasks,
  totalTasks: status.goal.totalTasks,
  currentTaskId: status.currentTaskId,
  updatedAt: 10,
} as const

const summaryV2 = {
  schemaVersion: 'tianwen.long-goal-summary.v2',
  id: statusV2.goal.id,
  objective: statusV2.goal.objective,
  phase: statusV2.goal.phase,
  revision: statusV2.goal.revision,
  completedTasks: statusV2.goal.completedTasks,
  abandonedTasks: statusV2.goal.abandonedTasks,
  totalTasks: statusV2.goal.totalTasks,
  currentTaskId: statusV2.currentTaskId,
  updatedAt: 20,
} as const

const statusV3 = {
  ...statusV2,
  schemaVersion: 'tianwen.long-goal-status.v3',
  goal: {
    ...statusV2.goal,
    id: 'tianwen-long-goal-v3',
    objective: 'Ship continuous Goal history',
  },
  planner: { ...statusV2.planner, sessionId: 'continuous-planner-session' },
  control: { sessionId: 'control-session', autoProgress: 'running' },
} as const

const summaryV3 = {
  schemaVersion: 'tianwen.long-goal-summary.v3',
  id: statusV3.goal.id,
  objective: statusV3.goal.objective,
  phase: statusV3.goal.phase,
  revision: statusV3.goal.revision,
  completedTasks: statusV3.goal.completedTasks,
  abandonedTasks: statusV3.goal.abandonedTasks,
  totalTasks: statusV3.goal.totalTasks,
  currentTaskId: statusV3.currentTaskId,
  updatedAt: 30,
  control: statusV3.control,
} as const

describe('Learn Loop browser RPC client', () => {
  it('sends the exact generic RPC status request and returns a valid projection', async () => {
    const signal = new AbortController().signal
    const rpc = {
      call: vi.fn().mockResolvedValue({ ok: true, value: { status } }),
    }

    const result = await createLearnLoopClient(rpc as never).status(
      'tianwen-long-goal-1',
      signal,
    )

    expect(rpc.call).toHaveBeenCalledWith(
      '/tianwen',
      'status',
      { longGoalId: 'tianwen-long-goal-1' },
      signal,
    )
    expect(result).toEqual(status)
  })

  it('rejects a successful response with extra status keys instead of accepting partial data', async () => {
    const rpc = {
      call: vi.fn().mockResolvedValue({
        ok: true,
        value: { status: { ...status, unsafe: 'state-root' } },
      }),
    }

    await expect(createLearnLoopClient(rpc as never).status('tianwen-long-goal-1'))
      .rejects.toThrow('invalid Tianwen RPC response')
  })

  it('strictly parses mixed v1/v2 list and status projections by schema version', async () => {
    const rpc = {
      call: vi.fn()
        .mockResolvedValueOnce({ ok: true, value: { goals: [summaryV1, summaryV2] } })
        .mockResolvedValueOnce({ ok: true, value: { status } })
        .mockResolvedValueOnce({ ok: true, value: { status: statusV2 } }),
    }
    const client = createLearnLoopClient(rpc as never)

    expect(await client.list()).toEqual([summaryV1, summaryV2])
    expect(await client.status(status.goal.id)).toEqual(status)
    expect(await client.status(statusV2.goal.id)).toEqual(statusV2)

    const { updatedAt: _v1UpdatedAt, ...missingV1SummaryField } = summaryV1
    const { revision: _v2Revision, ...missingV2SummaryField } = summaryV2
    for (const invalid of [
      { ...summaryV1, extra: true },
      { ...summaryV2, extra: true },
      missingV1SummaryField,
      missingV2SummaryField,
    ]) {
      const invalidRpc = {
        call: vi.fn().mockResolvedValue({ ok: true, value: { goals: [invalid] } }),
      }
      await expect(createLearnLoopClient(invalidRpc as never).list())
        .rejects.toThrow('invalid Tianwen RPC response')
    }
    const { runtime: _v1Runtime, ...missingV1StatusField } = status
    const { planner: _v2Planner, ...missingV2StatusField } = statusV2
    for (const invalid of [
      { ...status, extra: true },
      { ...statusV2, extra: true },
      missingV1StatusField,
      missingV2StatusField,
      {
        ...statusV2,
        tasks: [{ ...statusV2.tasks[0], phase: 'abandoned', resolution: null }],
      },
      {
        ...statusV2,
        tasks: [{ ...statusV2.tasks[0], phase: 'active', resolution: 'abandoned' }],
      },
      {
        ...statusV2,
        goal: { ...statusV2.goal, phase: 'blocked' },
        tasks: [{ ...statusV2.tasks[0], phase: 'blocked' }],
      },
    ]) {
      const invalidRpc = {
        call: vi.fn().mockResolvedValue({ ok: true, value: { status: invalid } }),
      }
      await expect(createLearnLoopClient(invalidRpc as never).status('goal'))
        .rejects.toThrow('invalid Tianwen RPC response')
    }
  })

  it('strictly parses running, paused, blocked, and complete v3 history projections', async () => {
    const summaries = [
      summaryV3,
      { ...summaryV3, id: 'paused', control: { ...summaryV3.control, autoProgress: 'paused' } },
      { ...summaryV3, id: 'blocked', phase: 'blocked' },
      {
        ...summaryV3,
        id: 'complete',
        phase: 'complete',
        completedTasks: summaryV3.totalTasks,
        currentTaskId: null,
      },
    ] as const
    const rpc = {
      call: vi.fn()
        .mockResolvedValueOnce({ ok: true, value: { goals: summaries } })
        .mockResolvedValueOnce({ ok: true, value: { status: statusV3 } }),
    }
    const client = createLearnLoopClient(rpc as never)

    expect(await client.list()).toEqual(summaries)
    expect(await client.status(statusV3.goal.id)).toEqual(statusV3)

    const { control: _missingSummaryControl, ...missingSummaryControl } = summaryV3
    const { control: _missingStatusControl, ...missingStatusControl } = statusV3
    for (const invalid of [
      missingSummaryControl,
      { ...summaryV3, control: { ...summaryV3.control, ignored: true } },
      { ...summaryV3, control: { ...summaryV3.control, autoProgress: 'stopped' } },
    ]) {
      const invalidRpc = {
        call: vi.fn().mockResolvedValue({ ok: true, value: { goals: [invalid] } }),
      }
      await expect(createLearnLoopClient(invalidRpc as never).list())
        .rejects.toThrow('invalid Tianwen RPC response')
    }
    for (const invalid of [
      missingStatusControl,
      { ...statusV3, control: { ...statusV3.control, ignored: true } },
      { ...statusV3, control: { ...statusV3.control, autoProgress: 'stopped' } },
    ]) {
      const invalidRpc = {
        call: vi.fn().mockResolvedValue({ ok: true, value: { status: invalid } }),
      }
      await expect(createLearnLoopClient(invalidRpc as never).status(statusV3.goal.id))
        .rejects.toThrow('invalid Tianwen RPC response')
    }
  })

  it('sends exact v2 mutation requests and strictly parses their named results', async () => {
    const progress = {
      schemaVersion: 'tianwen.goal-first-progress-result.v2',
      action: 'started',
      status: statusV2,
      sessionId: 'task-session',
    } as const
    const guidance = {
      schemaVersion: 'tianwen.long-goal-guidance-result.v2',
      planning: 'updated',
      status: { ...statusV2, goal: { ...statusV2.goal, revision: 5 } },
    } as const
    const abandoned = {
      schemaVersion: 'tianwen.long-goal-abandon-result.v2',
      action: 'abandoned',
      status: { ...statusV2, goal: { ...statusV2.goal, revision: 6 } },
    } as const
    const rpc = {
      call: vi.fn()
        .mockResolvedValueOnce({ ok: true, value: progress })
        .mockResolvedValueOnce({ ok: true, value: { ...progress, action: 'already-running' } })
        .mockResolvedValueOnce({ ok: true, value: guidance })
        .mockResolvedValueOnce({ ok: true, value: abandoned }),
    }
    const client = createLearnLoopClient(rpc as never)

    expect(await client.createGoalFirst({
      objective: 'Ship goal-first Learn Loop',
      context: 'Use the selected workspace',
      successCriteria: 'The first Task is admitted',
      workspaceSessionId: 'workspace-session',
    })).toEqual(progress)
    expect(await client.continueProgress({
      longGoalId: statusV2.goal.id,
      expectedRevision: 4,
    })).toMatchObject({ action: 'already-running' })
    expect(await client.addGuidance({
      longGoalId: statusV2.goal.id,
      expectedRevision: 5,
      text: 'Prefer the smaller implementation',
    })).toEqual(guidance)
    expect(await client.abandonCurrentTask({
      longGoalId: statusV2.goal.id,
      expectedRevision: 6,
    })).toEqual(abandoned)

    expect(rpc.call.mock.calls).toEqual([
      ['/tianwen', 'create-goal-first', {
        objective: 'Ship goal-first Learn Loop',
        context: 'Use the selected workspace',
        successCriteria: 'The first Task is admitted',
        workspaceSessionId: 'workspace-session',
      }, undefined],
      ['/tianwen', 'continue-progress', {
        longGoalId: statusV2.goal.id,
        expectedRevision: 4,
      }, undefined],
      ['/tianwen', 'add-guidance', {
        longGoalId: statusV2.goal.id,
        expectedRevision: 5,
        text: 'Prefer the smaller implementation',
      }, undefined],
      ['/tianwen', 'abandon-current-task', {
        longGoalId: statusV2.goal.id,
        expectedRevision: 6,
      }, undefined],
    ])

    const invalidRpc = { call: vi.fn().mockResolvedValue({
      ok: true,
      value: { ...progress, extra: true },
    }) }
    await expect(createLearnLoopClient(invalidRpc as never).createGoalFirst({
      objective: 'Goal', context: null, successCriteria: null, workspaceSessionId: 'session',
    })).rejects.toThrow('invalid Tianwen RPC response')

    const invalidGuidanceRpc = { call: vi.fn().mockResolvedValue({
      ok: true,
      value: { ...guidance, extra: true },
    }) }
    await expect(createLearnLoopClient(invalidGuidanceRpc as never).addGuidance({
      longGoalId: statusV2.goal.id, expectedRevision: 5, text: 'Guidance',
    })).rejects.toThrow('invalid Tianwen RPC response')

    const { action: _abandonAction, ...missingAbandonField } = abandoned
    const invalidAbandonRpc = { call: vi.fn().mockResolvedValue({
      ok: true,
      value: missingAbandonField,
    }) }
    await expect(createLearnLoopClient(invalidAbandonRpc as never).abandonCurrentTask({
      longGoalId: statusV2.goal.id, expectedRevision: 6,
    })).rejects.toThrow('invalid Tianwen RPC response')
  })

  it('does not expose Tianwen Task feedback reads or writes', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({
      ok: true,
      value: { status: statusV2 },
    }) }
    const client = createLearnLoopClient(rpc as never)

    expect(client).not.toHaveProperty('feedbackStatus')
    expect(client).not.toHaveProperty('recordTaskFeedback')
    await expect(client.status(statusV2.goal.id)).resolves.toEqual(statusV2)
    expect(rpc.call.mock.calls).toEqual([
      ['/tianwen', 'status', { longGoalId: statusV2.goal.id }, undefined],
    ])
  })

  it('reads a bounded read-only learning audit and rejects private content', async () => {
    const audit = {
      schemaVersion: 'tianwen.learning-audit.v1' as const,
      items: [{
        analysisId: `analysis:${'a'.repeat(64)}`,
        ticketId: `ticket:${'b'.repeat(64)}`,
        phase: 'promoted' as const,
        requestedAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:03:00.000Z',
        evidenceDigests: [`sha256:${'c'.repeat(64)}`],
        receipts: { candidateId: `candidate:${'d'.repeat(64)}` },
        recovery: null,
      }],
    }
    const signal = new AbortController().signal
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: audit }) }

    await expect(createLearnLoopClient(rpc as never).learningAudit(signal)).resolves.toEqual(audit)
    expect(rpc.call).toHaveBeenCalledWith('/tianwen', 'learning-audit', {}, signal)

    const privateRpc = { call: vi.fn().mockResolvedValue({ ok: true, value: {
      ...audit, items: [{ ...audit.items[0], privateNote: 'never expose' }],
    } }) }
    await expect(createLearnLoopClient(privateRpc as never).learningAudit())
      .rejects.toThrow('invalid Tianwen RPC response')
  })

  it('preserves exact revision-conflict details for UI recovery', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: 'revision-conflict',
        message: 'revision-conflict',
        details: { expectedRevision: 4, currentRevision: 5 },
      },
    }) }

    await expect(createLearnLoopClient(rpc as never).continueProgress({
      longGoalId: statusV2.goal.id,
      expectedRevision: 4,
    })).rejects.toMatchObject({
      message: 'revision-conflict',
      code: 'revision-conflict',
      details: { expectedRevision: 4, currentRevision: 5 },
    })
  })

  it('rejects RpcResult envelopes with conflicting or extra keys', async () => {
    const successWithError = {
      call: vi.fn().mockResolvedValue({
        ok: true,
        value: { status },
        error: { code: 'internal', message: 'unexpected', details: {} },
      }),
    }
    const failureWithValue = {
      call: vi.fn().mockResolvedValue({
        ok: false,
        value: { status },
        error: { code: 'internal', message: 'unexpected', details: {} },
      }),
    }

    await expect(createLearnLoopClient(successWithError as never).create({
      objective: 'Ship the Learn Loop entry',
      tasks: ['Add the browser entry'],
      maxTaskRounds: 3,
    })).rejects.toThrow('invalid Tianwen RPC response')
    await expect(createLearnLoopClient(failureWithValue as never).create({
      objective: 'Ship the Learn Loop entry',
      tasks: ['Add the browser entry'],
      maxTaskRounds: 3,
    })).rejects.toThrow('invalid Tianwen RPC response')
  })

  it('accepts only the exact internal error envelope', async () => {
    for (const error of [
      { code: 'other', message: 'unexpected', details: {} },
      { code: 'internal', message: 'unexpected' },
      { code: 'internal', message: 'unexpected', details: { retry: true } },
      { code: 'internal', message: 'unexpected', details: {}, extra: true },
    ]) {
      const rpc = { call: vi.fn().mockResolvedValue({ ok: false, error }) }
      await expect(createLearnLoopClient(rpc as never).list())
        .rejects.toThrow('invalid Tianwen RPC response')
    }

    const rpc = { call: vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'internal', message: 'expected failure', details: {} },
    }) }
    await expect(createLearnLoopClient(rpc as never).list())
      .rejects.toThrow('expected failure')
  })

  it('rejects a status projection that reports any model request', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({
      ok: true,
      value: { status: { ...status, runtime: { ...status.runtime, modelRequests: 1 } } },
    }) }

    await expect(createLearnLoopClient(rpc as never).status('tianwen-long-goal-1'))
      .rejects.toThrow('invalid Tianwen RPC response')
  })

  it('rejects blockedReason outside the blocked Task discriminant', async () => {
    const invalidStatuses = [
      {
        ...status,
        tasks: [{ ...status.tasks[0], blockedReason: { code: 'x', message: 'not blocked' } }],
      },
      {
        ...status,
        goal: { ...status.goal, phase: 'blocked' },
        tasks: [{ ...status.tasks[0], phase: 'blocked' }],
      },
    ]
    for (const invalid of invalidStatuses) {
      const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: { status: invalid } }) }
      await expect(createLearnLoopClient(rpc as never).status('tianwen-long-goal-1'))
        .rejects.toThrow('invalid Tianwen RPC response')
    }
  })

  it('rejects run-current-task action and sessionId combinations outside the host contract', async () => {
    const invalidResults = [
      { status, action: 'started' },
      { status, action: 'continued' },
      { status, action: 'already-running' },
      { status, action: 'complete', sessionId: 'session-1' },
    ]

    for (const value of invalidResults) {
      const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value }) }
      await expect(createLearnLoopClient(rpc as never).runCurrentTask({
        longGoalId: 'tianwen-long-goal-1',
      })).rejects.toThrow('invalid Tianwen RPC response')
    }
  })

  it('sends create and run-current-task only through the Tianwen channel', async () => {
    const rpc = {
      call: vi.fn()
        .mockResolvedValueOnce({ ok: true, value: { status } })
        .mockResolvedValueOnce({ ok: true, value: {
          status,
          sessionId: 'session-1',
          action: 'started',
        } }),
    }
    const client = createLearnLoopClient(rpc as never)

    await client.create({
      objective: 'Ship the Learn Loop entry',
      tasks: ['Add the browser entry'],
      maxTaskRounds: 3,
    })
    await client.runCurrentTask({
      longGoalId: 'tianwen-long-goal-1',
      initialCwd: 'D:/DevData/tianwen',
    })

    expect(rpc.call).toHaveBeenNthCalledWith(1, '/tianwen', 'create', {
      objective: 'Ship the Learn Loop entry',
      tasks: ['Add the browser entry'],
      maxTaskRounds: 3,
    }, undefined)
    expect(rpc.call).toHaveBeenNthCalledWith(2, '/tianwen', 'run-current-task', {
      longGoalId: 'tianwen-long-goal-1',
      initialCwd: 'D:/DevData/tianwen',
    }, undefined)
  })
})

describe('Learn Loop sidebar slot', () => {
  it('does not apply a deferred request success after the overlay is closed', async () => {
    let resolve: ((value: string) => void) | undefined
    const response = new Promise<string>(done => { resolve = done })
    const request = createRequestGeneration()
    const pending = request.begin()
    const applied: string[] = []

    const applyWhenCurrent = response.then(value => {
      if (pending.isCurrent()) applied.push(value)
    })
    request.close()
    expect(pending.signal.aborted).toBe(true)
    resolve?.('late success')
    await applyWhenCurrent

    expect(applied).toEqual([])
  })

  it('keeps the optional history action without registering a separate conversation dock', () => {
    let dispose: (() => void) | undefined
    const unregisterSlot = vi.fn()
    const unregisterZh = vi.fn()
    const unregisterEn = vi.fn()
    const register = vi.fn().mockReturnValueOnce(unregisterSlot)
    const registerLocale = vi.fn()
      .mockReturnValueOnce(unregisterZh)
      .mockReturnValueOnce(unregisterEn)
    const slots = {
      inject: vi.fn((_name: string, callback: () => (() => void)) => {
        dispose = callback()
        return dispose
      }),
      register,
    }
    const ctx = {
      slots,
      locale: { register: registerLocale },
      sessions: { open: vi.fn(), current: undefined },
      connection: { rpc: { call: vi.fn() } },
    }

    apply(ctx as never)

    expect(inject).toEqual(['slots', 'sessions', 'connection', 'locale'])
    expect(slots.inject).toHaveBeenCalledWith('sidebar.footer.action', expect.any(Function))
    expect(registerLocale).toHaveBeenNthCalledWith(
      1,
      'tianwen.learn-loop',
      'zh',
      expect.any(Object),
    )
    expect(registerLocale).toHaveBeenNthCalledWith(
      2,
      'tianwen.learn-loop',
      'en',
      expect.any(Object),
    )
    expect(Object.keys(registerLocale.mock.calls[0]![2] as object).sort()).toEqual(
      Object.keys(registerLocale.mock.calls[1]![2] as object).sort(),
    )
    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenNthCalledWith(1, {
      name: 'sidebar.footer.action',
      id: 'tianwen-learn-loop',
      order: 20,
    }, expect.any(Function))

    dispose?.()
    expect(unregisterSlot).toHaveBeenCalledOnce()
    expect(unregisterZh).toHaveBeenCalledOnce()
    expect(unregisterEn).toHaveBeenCalledOnce()
  })
})
