import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FIRST_LIVENESS_MS,
  REPEAT_LIVENESS_MS,
  createLongGoalLiveness,
  type DurableProgressFact,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-liveness.js'

function fact(stage: string, changedAt: string): DurableProgressFact {
  return {
    stage,
    lastCompletedAction: `${stage} prepared`,
    waitingFor: `${stage} result`,
    nextAction: `${stage} verification`,
    changedAt,
  }
}

describe('Long Goal main-parent liveness', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('immediately coalesces sibling stage changes into one main-parent report', async () => {
    const reports: unknown[] = []
    const liveness = createLongGoalLiveness<string>({
      report: async report => { reports.push(report) },
    })

    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-1', reporter: 'planner-1',
      state: 'active', fact: fact('planning', '2026-09-01T00:00:00.000Z'),
    })
    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-2', reporter: 'planner-2',
      state: 'active', fact: fact('verification', '2026-09-01T00:00:01.000Z'),
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(reports).toEqual([{
      parentKey: 'main-1',
      reporter: 'planner-2',
      facts: [
        fact('planning', '2026-09-01T00:00:00.000Z'),
        fact('verification', '2026-09-01T00:00:01.000Z'),
      ],
    }])
    await liveness.dispose()
  })

  it('returns to the remaining source reporter after a newer sibling terminates', async () => {
    const report = vi.fn(async () => undefined)
    const liveness = createLongGoalLiveness<string>({ report })
    const first = fact('implementation', '2026-09-01T00:00:00.000Z')
    const second = fact('verification', '2026-09-01T00:00:01.000Z')

    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-1', reporter: 'planner-1',
      state: 'active', fact: first,
    })
    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-2', reporter: 'planner-2',
      state: 'active', fact: second,
    })
    await vi.advanceTimersByTimeAsync(0)
    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-2', state: 'terminal',
    })
    await vi.advanceTimersByTimeAsync(FIRST_LIVENESS_MS)

    expect(report).toHaveBeenLastCalledWith({
      parentKey: 'main-1', reporter: 'planner-1', facts: [first],
    })
    await liveness.dispose()
  })

  it('sends first liveness at 120 seconds and later liveness no sooner than every 300 seconds', async () => {
    const report = vi.fn(async () => undefined)
    const liveness = createLongGoalLiveness<string>({ report })

    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-1', reporter: 'planner-1',
      state: 'active', fact: fact('implementation', '2026-09-01T00:00:00.000Z'),
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(report).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(FIRST_LIVENESS_MS - 1)
    expect(report).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(report).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(REPEAT_LIVENESS_MS - 1)
    expect(report).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(report).toHaveBeenCalledTimes(3)
    await liveness.dispose()
  })

  it('reports a real stage change immediately and restarts the first-liveness timer', async () => {
    const report = vi.fn(async () => undefined)
    const liveness = createLongGoalLiveness<string>({ report })

    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-1', reporter: 'planner-1',
      state: 'active', fact: fact('implementation', '2026-09-01T00:00:00.000Z'),
    })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(FIRST_LIVENESS_MS - 1)

    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-1', reporter: 'planner-1',
      state: 'active', fact: fact('verification', '2026-09-01T00:01:59.999Z'),
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(report).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(FIRST_LIVENESS_MS - 1)
    expect(report).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(report).toHaveBeenCalledTimes(3)
    await liveness.dispose()
  })

  it('does not treat a timestamp-only refresh as a real stage change', async () => {
    const report = vi.fn(async () => undefined)
    const liveness = createLongGoalLiveness<string>({ report })

    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-1', reporter: 'planner-1',
      state: 'active', fact: fact('implementation', '2026-09-01T00:00:00.000Z'),
    })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(FIRST_LIVENESS_MS - 1)

    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-1', reporter: 'planner-1',
      state: 'active', fact: fact('implementation', '2026-09-01T00:01:59.999Z'),
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(report).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(report).toHaveBeenCalledTimes(2)
    await liveness.dispose()
  })

  it.each(['blocked', 'terminal'] as const)('stops immediately when the source becomes %s', async state => {
    const report = vi.fn(async () => undefined)
    const liveness = createLongGoalLiveness<string>({ report })

    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-1', reporter: 'planner-1',
      state: 'active', fact: fact('implementation', '2026-09-01T00:00:00.000Z'),
    })
    await vi.advanceTimersByTimeAsync(0)
    liveness.observe({
      parentKey: 'main-1', sourceKey: 'goal-1', state,
    })
    await vi.advanceTimersByTimeAsync(FIRST_LIVENESS_MS + REPEAT_LIVENESS_MS)

    expect(report).toHaveBeenCalledTimes(1)
    await liveness.dispose()
  })
})
