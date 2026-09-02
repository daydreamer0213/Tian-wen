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

  it('reads the safe learning clue projection and rejects private or malformed fields', async () => {
    const clueStatus = {
      schemaVersion: 'tianwen.learning-clue-status.v1' as const,
      items: [{
        ticketId: `ticket:${'a'.repeat(64)}`,
        status: 'open' as const,
        occurrenceCount: 2,
        analysis: null,
        review: null,
        sources: [{
          longGoalId: statusV2.goal.id,
          goalObjective: statusV2.goal.objective,
          taskId: statusV2.tasks[0].id,
          taskObjective: statusV2.tasks[0].objective,
          recordedAt: '2026-08-30T00:00:00.000Z',
        }],
      }],
    }
    const signal = new AbortController().signal
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: clueStatus }) }

    expect(await createLearnLoopClient(rpc as never).learningClues(signal)).toEqual(clueStatus)
    expect(rpc.call).toHaveBeenCalledWith('/tianwen', 'learning-clues', {}, signal)

    const unsupported = {
      ...clueStatus,
      items: [{ ...clueStatus.items[0], status: 'unsupported' as const }],
    }
    const unsupportedRpc = { call: vi.fn().mockResolvedValue({ ok: true, value: unsupported }) }
    await expect(createLearnLoopClient(unsupportedRpc as never).learningClues())
      .resolves.toEqual(unsupported)

    for (const analysis of [
      {
        phase: 'running' as const,
        sessionId: 'analysis-running',
        startedAt: '2026-08-30T00:01:00.000Z',
      },
      {
        phase: 'complete' as const,
        sessionId: 'analysis-complete',
        startedAt: '2026-08-30T00:01:00.000Z',
        finishedAt: '2026-08-30T00:02:00.000Z',
      },
      {
        phase: 'failed' as const,
        sessionId: 'analysis-failed',
        startedAt: '2026-08-30T00:01:00.000Z',
        finishedAt: '2026-08-30T00:02:00.000Z',
      },
    ]) {
      const analyzed = {
        ...clueStatus,
        items: [{ ...clueStatus.items[0], analysis }],
      }
      const analyzedRpc = { call: vi.fn().mockResolvedValue({ ok: true, value: analyzed }) }
      await expect(createLearnLoopClient(analyzedRpc as never).learningClues())
        .resolves.toEqual(analyzed)
    }

    const terminalAnalysis = {
      phase: 'complete' as const,
      sessionId: 'analysis-complete',
      startedAt: '2026-08-30T00:01:00.000Z',
      finishedAt: '2026-08-30T00:02:00.000Z',
    }
    const reviewed = {
      ...clueStatus,
      items: [{ ...clueStatus.items[0], analysis: terminalAnalysis, review: {
        reviewedAt: '2026-08-30T00:03:00.000Z',
        occurrenceCount: 2,
      } }],
    }
    const reviewedRpc = { call: vi.fn().mockResolvedValue({ ok: true, value: reviewed }) }
    await expect(createLearnLoopClient(reviewedRpc as never).learningClues())
      .resolves.toEqual(reviewed)

    for (const invalid of [
      { ...clueStatus, extra: true },
      { ...clueStatus, items: [{ ...clueStatus.items[0], problemFingerprint: 'private' }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], signalIds: ['private'] }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], occurrenceCount: 0 }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], status: 'closed' }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], status: 'retracted' }] },
      { ...reviewed, items: [{ ...reviewed.items[0], review: {
        reviewedAt: '2026-08-30T00:03:00Z', occurrenceCount: 2,
      } }] },
      { ...reviewed, items: [{ ...reviewed.items[0], review: {
        reviewedAt: '2026-08-30T00:03:00.000Z', occurrenceCount: 0,
      } }] },
      { ...reviewed, items: [{ ...reviewed.items[0], review: {
        reviewedAt: '2026-08-30T00:03:00.000Z', occurrenceCount: 2, note: 'private',
      } }] },
      { ...reviewed, items: [{ ...reviewed.items[0], analysis: null }] },
      { ...reviewed, items: [{ ...reviewed.items[0], analysis: {
        phase: 'running', sessionId: 'analysis', startedAt: '2026-08-30T00:01:00.000Z',
      } }] },
      { ...reviewed, items: [{ ...reviewed.items[0], review: {
        reviewedAt: '2026-08-30T00:03:00.000Z', occurrenceCount: 1,
      } }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], analysis: {
        phase: 'running', sessionId: 'analysis', startedAt: '2026-08-30T00:01:00.000Z',
        finishedAt: '2026-08-30T00:02:00.000Z',
      } }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], analysis: {
        phase: 'complete', sessionId: 'analysis', startedAt: '2026-08-30T00:01:00.000Z',
      } }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], analysis: {
        phase: 'failed', sessionId: 'analysis', startedAt: '2026-08-30T00:01:00.000Z',
      } }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], analysis: {
        phase: 'running', sessionId: 'analysis', startedAt: '2026-08-30T00:01:00Z',
      } }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], analysis: {
        phase: 'complete', sessionId: 'analysis', startedAt: '2026-08-30T00:01:00.000Z',
        finishedAt: '2026-08-30T00:02:00Z',
      } }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], analysis: {
        phase: 'complete', sessionId: 'analysis', startedAt: 'now', privateNote: 'private',
      } }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], sources: [{
        ...clueStatus.items[0].sources[0], note: 'private',
      }] }] },
      { ...clueStatus, items: [{ ...clueStatus.items[0], sources: [] }] },
      { ...clueStatus, items: [clueStatus.items[0], clueStatus.items[0]] },
      { ...clueStatus, items: [{
        ...clueStatus.items[0],
        sources: [clueStatus.items[0].sources[0], clueStatus.items[0].sources[0]],
      }] },
    ]) {
      const invalidRpc = { call: vi.fn().mockResolvedValue({ ok: true, value: invalid }) }
      await expect(createLearnLoopClient(invalidRpc as never).learningClues())
        .rejects.toThrow('invalid Tianwen RPC response')
    }
  })

  it('starts one learning-clue analysis with exact request and response parsing', async () => {
    const ticketId = `ticket:${'a'.repeat(64)}`
    const start = {
      schemaVersion: 'tianwen.learning-clue-analysis-start.v1' as const,
      created: true,
      sessionId: 'analysis-session',
    }
    const signal = new AbortController().signal
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: start }) }
    const client = createLearnLoopClient(rpc as never)

    await expect(client.analyzeLearningClue(ticketId, signal)).resolves.toEqual(start)
    expect(rpc.call).toHaveBeenCalledWith(
      '/tianwen', 'analyze-learning-clue', { ticketId }, signal,
    )

    for (const invalid of [
      { ...start, extra: true },
      { ...start, schemaVersion: 'tianwen.learning-clue-analysis-start.v2' },
      { ...start, created: 'yes' },
      { ...start, sessionId: '' },
    ]) {
      const invalidRpc = { call: vi.fn().mockResolvedValue({ ok: true, value: invalid }) }
      await expect(createLearnLoopClient(invalidRpc as never).analyzeLearningClue(ticketId))
        .rejects.toThrow('invalid Tianwen RPC response')
    }
  })

  it('marks one terminal learning clue reviewed with exact request and response parsing', async () => {
    const ticketId = `ticket:${'a'.repeat(64)}`
    const result = {
      schemaVersion: 'tianwen.learning-clue-review-result.v1' as const,
      reviewed: true as const,
      occurrenceCount: 2,
      reviewedAt: '2026-08-30T00:03:00.000Z',
    }
    const signal = new AbortController().signal
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: result }) }
    const client = createLearnLoopClient(rpc as never)

    await expect(client.reviewLearningClue(ticketId, signal)).resolves.toEqual(result)
    expect(rpc.call).toHaveBeenCalledWith(
      '/tianwen', 'review-learning-clue', { ticketId }, signal,
    )

    for (const invalid of [
      { ...result, extra: true },
      { ...result, schemaVersion: 'tianwen.learning-clue-review-result.v2' },
      { ...result, reviewed: false },
      { ...result, occurrenceCount: 0 },
      { ...result, reviewedAt: '2026-08-30T00:03:00Z' },
    ]) {
      const invalidRpc = { call: vi.fn().mockResolvedValue({ ok: true, value: invalid }) }
      await expect(createLearnLoopClient(invalidRpc as never).reviewLearningClue(ticketId))
        .rejects.toThrow('invalid Tianwen RPC response')
    }
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
