import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  sha256,
  type LearningIntakeStatus,
} from '../../packages/tianwen-evolution/src/learning-intake.js'

import {
  readGoalTaskFeedbackStatus,
  recordGoalTaskFeedback,
  type GoalTaskFeedbackDependencies,
} from '../../packages/tianwen-runtime-bundle/src/goal-task-feedback.js'
import type {
  LongGoalRecordV2,
  LongGoalRecordV3,
  LongGoalStatusProjectionV2,
  LongGoalStatusProjectionV3,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'

const ROOTS = {
  stateRoot: 'D:/state',
  dshStatusTarget: { sessionsRoot: 'D:/sessions', evolutionRoot: 'D:/evolution' },
}

function record(): LongGoalRecordV2 {
  return {
    schemaVersion: 'tianwen.long-goal.v2',
    id: 'tianwen-long-goal-feedback',
    revision: 3,
    objective: 'Ship useful feedback',
    context: null,
    successCriteria: null,
    workspaceRoot: 'D:/workspace',
    maxTaskRounds: 3,
    planner: {
      sessionId: 'planner-session', agentPreset: 'default', planRevision: 1,
      phase: 'complete', consideredSettledTasks: 1,
    },
    guidance: [],
    createdAt: 1,
    updatedAt: 2,
    tasks: [{
      id: 'task-1', objective: 'Implement feedback',
      execution: { goalId: 'goal-1', sessionId: 'session-1' }, resolution: null,
    }],
  }
}

function status(phase: LongGoalStatusProjectionV2['tasks'][number]['phase'] = 'complete'):
LongGoalStatusProjectionV2 {
  return {
    schemaVersion: 'tianwen.long-goal-status.v2',
    goal: {
      id: 'tianwen-long-goal-feedback', objective: 'Ship useful feedback',
      context: null, successCriteria: null,
      phase: phase === 'complete' || phase === 'abandoned' ? 'complete' : 'active',
      revision: 3, completedTasks: phase === 'complete' ? 1 : 0,
      abandonedTasks: phase === 'abandoned' ? 1 : 0, totalTasks: 1,
    },
    planner: { sessionId: 'planner-session', phase: 'complete', planRevision: 1 },
    guidance: [],
    tasks: [{
      id: 'task-1', objective: 'Implement feedback', phase,
      execution: { goalId: 'goal-1', sessionId: 'session-1' },
      resolution: phase === 'abandoned' ? 'abandoned' : null,
    }],
    currentTaskId: phase === 'complete' || phase === 'abandoned' ? null : 'task-1',
    runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
  }
}

function completedSession(terminalPhase: 'complete' | 'blocked' = 'complete'): Session {
  return {
    id: 'session-1',
    events: [
      { type: 'turn/start', seq: 0, data: { turn: 1 } },
      {
        type: 'user/message', seq: 1, surfaceOp: 'append',
        data: {
          id: 'goal-round', role: 'user', content: [{ type: 'text', text: 'finish the task' }],
          source: { kind: 'goal', goalId: 'goal-1', revision: 1, round: 1 },
        },
      },
      {
        type: 'assistant/message', seq: 2, surfaceOp: 'append',
        data: {
          turn: 1,
          message: { id: 'message-final', role: 'assistant', content: [{ type: 'text', text: 'done' }] },
        },
      },
      {
        type: 'goal/change', seq: 3, data: {
          kind: 'goal/change', version: 1,
          operation: terminalPhase === 'complete' ? 'complete' : 'block',
          goal: {
            id: 'goal-1', revision: 2, objective: 'Implement feedback', maxGoalRounds: 3,
            phase: terminalPhase,
          },
          roundsStarted: 1, createdAt: 1, updatedAt: 2,
        },
      },
      { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } },
      { type: 'turn/start', seq: 5, data: { turn: 2 } },
      {
        type: 'assistant/message', seq: 6, surfaceOp: 'append',
        data: {
          turn: 2,
          message: { id: 'message-unrelated', role: 'assistant', content: [{ type: 'text', text: 'later chat' }] },
        },
      },
      { type: 'turn/end', seq: 7, data: { turn: 2, reason: { kind: 'completed' } } },
    ],
  } as unknown as Session
}

function intakeStatus(note = 'Keep the final answer concrete.'): LearningIntakeStatus {
  return {
    sessionId: 'session-1',
    messageId: 'message-final',
    scopeKey: 'workspace:D:/workspace',
    rating: 'negative' as const,
    feedbackFingerprint: sha256({
      rating: 'negative',
      normalizedNote: note.toLowerCase(),
    }),
    recordedAt: '2026-08-30T00:00:00.000Z',
    decision: 'ticket-created' as const,
    ingestionId: `sha256:${'1'.repeat(64)}` as const,
    signalId: `signal:${'2'.repeat(64)}` as const,
    ticketId: `ticket:${'3'.repeat(64)}` as const,
  }
}

function dependencies(
  taskStatus = status(),
  existing?: LearningIntakeStatus,
): GoalTaskFeedbackDependencies {
  const persisted = intakeStatus()
  let consumed = false
  return {
    readLongGoal: vi.fn(() => record()),
    readLongGoalStatus: vi.fn(async () => taskStatus),
    awaitSessionIdle: vi.fn(async () => undefined),
    openSession: vi.fn(async () => ({
      session: completedSession(taskStatus.tasks[0]?.phase === 'abandoned' ? 'blocked' : 'complete'),
      release: vi.fn(),
    })),
    consume: vi.fn(() => {
      consumed = true
      return {
        decision: 'ticket-created', ingestionId: persisted.ingestionId,
        signalId: persisted.signalId, ticketId: persisted.ticketId,
        duplicate: false, sessionUnchanged: true,
      }
    }),
    getLearningIntakeStatus: vi.fn(() => consumed ? persisted : existing),
  }
}

describe('Goal-first settled Task feedback', () => {
  it('records final-message feedback through the existing intake and releases a cold Session', async () => {
    const deps = dependencies()

    await expect(recordGoalTaskFeedback({
      ...ROOTS,
      longGoalId: 'tianwen-long-goal-feedback', taskId: 'task-1',
      rating: 'negative', note: 'Keep the final answer concrete.',
    }, deps)).resolves.toEqual({
      schemaVersion: 'tianwen.goal-task-feedback-record.v1',
      duplicate: false,
      item: {
        taskId: 'task-1', rating: 'negative', decision: 'ticket-created',
        recordedAt: '2026-08-30T00:00:00.000Z',
        ticketId: `ticket:${'3'.repeat(64)}`,
      },
    })

    expect(deps.consume).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1' }),
      'workspace:D:/workspace',
      expect.objectContaining({
        messageId: 'message-final', rating: 'negative',
        note: 'Keep the final answer concrete.',
        version: expect.stringMatching(/^goal-task:/u),
      }),
    )
    const lease = await vi.mocked(deps.openSession).mock.results[0]!.value
    expect(lease.release).toHaveBeenCalledOnce()
  })

  it('waits for the live Task Agent to finish before reading its final message', async () => {
    const deps = dependencies()
    const idle = Promise.withResolvers<void>()
    vi.mocked(deps.awaitSessionIdle).mockImplementation(() => idle.promise)

    const pending = recordGoalTaskFeedback({
      ...ROOTS,
      longGoalId: 'tianwen-long-goal-feedback', taskId: 'task-1',
      rating: 'negative', note: 'Keep the final answer concrete.',
    }, deps)
    await Promise.resolve()
    expect(deps.openSession).not.toHaveBeenCalled()

    idle.resolve()
    await expect(pending).resolves.toMatchObject({
      schemaVersion: 'tianwen.goal-task-feedback-record.v1',
      duplicate: false,
      item: { taskId: 'task-1', decision: 'ticket-created' },
    })
    expect(deps.awaitSessionIdle).toHaveBeenCalledWith('session-1')
  })

  it.each(['pending', 'active', 'paused', 'blocked'] as const)(
    'rejects feedback while the Task is %s without opening its Session',
    async phase => {
      const deps = dependencies(status(phase))
      await expect(recordGoalTaskFeedback({
        ...ROOTS,
        longGoalId: 'tianwen-long-goal-feedback', taskId: 'task-1',
        rating: 'positive', note: null,
      }, deps)).rejects.toThrow(/settled/i)
      expect(deps.openSession).not.toHaveBeenCalled()
      expect(deps.consume).not.toHaveBeenCalled()
    },
  )

  it('treats a retry of the latest identical feedback as a duplicate without another intake write', async () => {
    const existing = intakeStatus()
    const deps = dependencies(status(), existing)

    await expect(recordGoalTaskFeedback({
      ...ROOTS,
      longGoalId: 'tianwen-long-goal-feedback', taskId: 'task-1',
      rating: 'negative', note: '  Keep the FINAL answer concrete.  ',
    }, deps)).resolves.toMatchObject({
      duplicate: true,
      item: { taskId: 'task-1', rating: 'negative', decision: 'ticket-created' },
    })

    expect(deps.consume).not.toHaveBeenCalled()
  })

  it('rebuilds a sanitized receipt list without exposing the correction note', async () => {
    const deps = dependencies(status('abandoned'), intakeStatus())
    await expect(readGoalTaskFeedbackStatus({
      ...ROOTS,
      longGoalId: 'tianwen-long-goal-feedback',
    }, deps)).resolves.toEqual({
      schemaVersion: 'tianwen.goal-task-feedback-status.v1',
      items: [{
        taskId: 'task-1', rating: 'negative', decision: 'ticket-created',
        recordedAt: '2026-08-30T00:00:00.000Z',
        ticketId: `ticket:${'3'.repeat(64)}`,
      }],
    })
    expect(JSON.stringify(await readGoalTaskFeedbackStatus({
      ...ROOTS,
      longGoalId: 'tianwen-long-goal-feedback',
    }, deps))).not.toContain('Keep the final answer concrete.')
  })

  it('keeps settled continuous Goal feedback available through the existing history path', async () => {
    const continuousRecord: LongGoalRecordV3 = {
      ...record(),
      schemaVersion: 'tianwen.long-goal.v3',
      control: { sessionId: 'control-session', autoProgress: 'running' },
    }
    const continuousStatus: LongGoalStatusProjectionV3 = {
      ...status(),
      schemaVersion: 'tianwen.long-goal-status.v3',
      control: continuousRecord.control,
    }
    const deps = dependencies(continuousStatus, intakeStatus())
    vi.mocked(deps.readLongGoal).mockReturnValue(continuousRecord)

    await expect(readGoalTaskFeedbackStatus({
      ...ROOTS,
      longGoalId: continuousRecord.id,
    }, deps)).resolves.toMatchObject({
      schemaVersion: 'tianwen.goal-task-feedback-status.v1',
      items: [{ taskId: 'task-1', decision: 'ticket-created' }],
    })
    await expect(recordGoalTaskFeedback({
      ...ROOTS,
      longGoalId: continuousRecord.id,
      taskId: 'task-1',
      rating: 'negative',
      note: 'Keep the final answer concrete.',
    }, deps)).resolves.toMatchObject({ duplicate: true, item: { taskId: 'task-1' } })
    expect(deps.consume).not.toHaveBeenCalled()
  })
})
