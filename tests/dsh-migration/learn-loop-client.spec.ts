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

  it('registers one footer action and disposes the registration with its fiber', () => {
    let dispose: (() => void) | undefined
    const unregister = vi.fn()
    const register = vi.fn(() => unregister)
    const slots = {
      inject: vi.fn((_name: string, callback: () => (() => void)) => {
        dispose = callback()
        return dispose
      }),
      register,
    }
    const ctx = {
      slots,
      sessions: { open: vi.fn(), current: undefined },
      connection: { rpc: { call: vi.fn() } },
    }

    apply(ctx as never)

    expect(inject).toEqual(['slots', 'sessions', 'connection'])
    expect(slots.inject).toHaveBeenCalledWith('sidebar.footer.action', expect.any(Function))
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith({
      name: 'sidebar.footer.action',
      id: 'tianwen-learn-loop',
      order: 20,
    }, expect.any(Function))

    dispose?.()
    expect(unregister).toHaveBeenCalledOnce()
  })
})
