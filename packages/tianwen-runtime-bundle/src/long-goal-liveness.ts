export const FIRST_LIVENESS_MS = 120_000
export const REPEAT_LIVENESS_MS = 300_000

export interface DurableProgressFact {
  readonly stage: string
  readonly lastCompletedAction?: string
  readonly waitingFor?: string
  readonly nextAction?: string
  readonly changedAt: string
}

export interface LongGoalLivenessObservation<TReporter> {
  readonly parentKey: string
  readonly sourceKey: string
  readonly reporter: TReporter
  readonly state: 'active' | 'blocked' | 'terminal'
  readonly fact: DurableProgressFact
}

export interface LongGoalLivenessReport<TReporter> {
  readonly parentKey: string
  readonly reporter: TReporter
  readonly facts: readonly DurableProgressFact[]
}

export interface LongGoalLiveness<TReporter> {
  observe(observation: LongGoalLivenessObservation<TReporter>): void
  dispose(): Promise<void>
}

type Lane<TReporter> = {
  readonly sources: Map<string, DurableProgressFact>
  reporter: TReporter
  timer: ReturnType<typeof setTimeout> | undefined
  queued: boolean
  running: Promise<void>
}

function sameFact(left: DurableProgressFact | undefined, right: DurableProgressFact): boolean {
  return left !== undefined
    && left.stage === right.stage
    && left.lastCompletedAction === right.lastCompletedAction
    && left.waitingFor === right.waitingFor
    && left.nextAction === right.nextAction
}

export function createLongGoalLiveness<TReporter>(options: {
  readonly report: (report: LongGoalLivenessReport<TReporter>) => Promise<void>
  readonly reportError?: (error: unknown) => void
}): LongGoalLiveness<TReporter> {
  const lanes = new Map<string, Lane<TReporter>>()
  let disposed = false

  const queueReport = (parentKey: string, lane: Lane<TReporter>): void => {
    if (lane.queued || disposed) return
    lane.queued = true
    lane.running = lane.running.then(async () => {
      lane.queued = false
      if (disposed || lane.sources.size === 0) return
      await options.report({ parentKey, reporter: lane.reporter, facts: [...lane.sources.values()] })
    }, async () => {
      lane.queued = false
      if (disposed || lane.sources.size === 0) return
      await options.report({ parentKey, reporter: lane.reporter, facts: [...lane.sources.values()] })
    })
    void lane.running.catch(error => { options.reportError?.(error) })
  }

  const schedule = (parentKey: string, lane: Lane<TReporter>, delay: number): void => {
    if (lane.timer !== undefined) clearTimeout(lane.timer)
    lane.timer = setTimeout(() => {
      lane.timer = undefined
      if (disposed || lane.sources.size === 0) return
      queueReport(parentKey, lane)
      schedule(parentKey, lane, REPEAT_LIVENESS_MS)
    }, delay)
  }

  return {
    observe(observation) {
      if (disposed) return
      const existing = lanes.get(observation.parentKey)
      if (observation.state !== 'active') {
        if (existing === undefined) return
        existing.sources.delete(observation.sourceKey)
        if (existing.sources.size === 0) {
          if (existing.timer !== undefined) clearTimeout(existing.timer)
          existing.timer = undefined
          lanes.delete(observation.parentKey)
        }
        return
      }

      const lane = existing ?? {
        sources: new Map<string, DurableProgressFact>(),
        reporter: observation.reporter,
        timer: undefined,
        queued: false,
        running: Promise.resolve(),
      }
      if (sameFact(lane.sources.get(observation.sourceKey), observation.fact)) {
        lane.reporter = observation.reporter
        return
      }
      lane.sources.set(observation.sourceKey, observation.fact)
      lane.reporter = observation.reporter
      lanes.set(observation.parentKey, lane)
      queueReport(observation.parentKey, lane)
      schedule(observation.parentKey, lane, FIRST_LIVENESS_MS)
    },
    async dispose() {
      disposed = true
      for (const lane of lanes.values()) {
        if (lane.timer !== undefined) clearTimeout(lane.timer)
      }
      await Promise.allSettled([...lanes.values()].map(lane => lane.running))
      lanes.clear()
    },
  }
}
