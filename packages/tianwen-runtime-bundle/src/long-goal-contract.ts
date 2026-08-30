export interface TaskExecutionBinding {
  readonly goalId: string
  readonly sessionId: string
}

export interface LongGoalTaskRecord {
  readonly id: string
  readonly objective: string
  readonly execution: TaskExecutionBinding | null
}

export interface LongGoalRecord {
  readonly schemaVersion: 'tianwen.long-goal.v1'
  readonly id: string
  readonly objective: string
  readonly maxTaskRounds: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly tasks: readonly LongGoalTaskRecord[]
}

export interface LongGoalStatusProjection {
  readonly schemaVersion: 'tianwen.long-goal-status.v1'
  readonly goal: {
    readonly id: string
    readonly objective: string
    readonly phase: 'active' | 'blocked' | 'complete'
    readonly completedTasks: number
    readonly totalTasks: number
  }
  readonly tasks: readonly {
    readonly id: string
    readonly objective: string
    readonly phase: 'pending' | 'active' | 'paused' | 'blocked' | 'complete'
    readonly execution: TaskExecutionBinding | null
    readonly blockedReason?: {
      readonly code: string
      readonly message: string
    }
  }[]
  readonly currentTaskId: string | null
  readonly runtime: {
    readonly activation: 'not-loaded'
    readonly modelRequests: 0
    readonly readOnly: true
  }
}

export interface LongGoalSummary {
  readonly id: string
  readonly objective: string
  readonly phase: 'active' | 'blocked' | 'complete'
  readonly completedTasks: number
  readonly totalTasks: number
  readonly currentTaskId: string | null
  readonly updatedAt: number
}

export interface LongGoalTaskRecordV2 {
  readonly id: string
  readonly objective: string
  readonly execution: TaskExecutionBinding | null
  readonly resolution: null | 'abandoned'
}

export interface LongGoalRecordV2 {
  readonly schemaVersion: 'tianwen.long-goal.v2'
  readonly id: string
  readonly revision: number
  readonly objective: string
  readonly context: string | null
  readonly successCriteria: string | null
  readonly workspaceRoot: string
  readonly maxTaskRounds: number
  readonly planner: {
    readonly sessionId: string
    readonly agentPreset: string
    readonly planRevision: number
    readonly phase: 'unplanned' | 'ready' | 'needs-replan' | 'complete'
    readonly consideredSettledTasks: number
  }
  readonly guidance: readonly string[]
  readonly createdAt: number
  readonly updatedAt: number
  readonly tasks: readonly LongGoalTaskRecordV2[]
}

export interface LongGoalRecordV3 extends Omit<LongGoalRecordV2, 'schemaVersion'> {
  readonly schemaVersion: 'tianwen.long-goal.v3'
  readonly control: {
    readonly sessionId: string
    readonly autoProgress: 'running' | 'paused'
  }
}

export type GoalFirstLongGoalRecord = LongGoalRecordV2 | LongGoalRecordV3

export interface LongGoalSummaryV2 {
  readonly schemaVersion: 'tianwen.long-goal-summary.v2'
  readonly id: string
  readonly objective: string
  readonly phase: 'planning' | 'active' | 'blocked' | 'complete'
  readonly revision: number
  readonly completedTasks: number
  readonly abandonedTasks: number
  readonly totalTasks: number
  readonly currentTaskId: string | null
  readonly updatedAt: number
}

export interface LongGoalSummaryV3 extends Omit<LongGoalSummaryV2, 'schemaVersion'> {
  readonly schemaVersion: 'tianwen.long-goal-summary.v3'
  readonly control: LongGoalRecordV3['control']
}

export interface LongGoalStatusProjectionV2 {
  readonly schemaVersion: 'tianwen.long-goal-status.v2'
  readonly goal: {
    readonly id: string
    readonly objective: string
    readonly context: string | null
    readonly successCriteria: string | null
    readonly phase: 'planning' | 'active' | 'blocked' | 'complete'
    readonly revision: number
    readonly completedTasks: number
    readonly abandonedTasks: number
    readonly totalTasks: number
  }
  readonly planner: {
    readonly sessionId: string
    readonly phase: 'unplanned' | 'ready' | 'needs-replan' | 'complete'
    readonly planRevision: number
  }
  readonly guidance: readonly string[]
  readonly tasks: readonly {
    readonly id: string
    readonly objective: string
    readonly phase: 'pending' | 'active' | 'paused' | 'blocked' | 'complete' | 'abandoned'
    readonly execution: TaskExecutionBinding | null
    readonly resolution: null | 'abandoned'
    readonly blockedReason?: { readonly code: string, readonly message: string }
  }[]
  readonly currentTaskId: string | null
  readonly runtime: {
    readonly activation: 'not-loaded'
    readonly modelRequests: 0
    readonly readOnly: true
  }
}

export interface LongGoalStatusProjectionV3 extends Omit<LongGoalStatusProjectionV2, 'schemaVersion'> {
  readonly schemaVersion: 'tianwen.long-goal-status.v3'
  readonly control: LongGoalRecordV3['control']
}

export type GoalFirstLongGoalStatusProjection = LongGoalStatusProjectionV2 | LongGoalStatusProjectionV3
export type ReadLongGoalStatusProjection = LongGoalStatusProjection | GoalFirstLongGoalStatusProjection

export interface GoalFirstProgressResultV2 {
  readonly schemaVersion: 'tianwen.goal-first-progress-result.v2'
  readonly action:
    | 'planning-pending' | 'started' | 'continued'
    | 'already-running' | 'blocked' | 'complete'
  readonly status: LongGoalStatusProjectionV2
  readonly sessionId: string | null
}

export interface LongGoalGuidanceResultV2 {
  readonly schemaVersion: 'tianwen.long-goal-guidance-result.v2'
  readonly planning: 'updated' | 'pending'
  readonly status: LongGoalStatusProjectionV2
}

export interface LongGoalAbandonResultV2 {
  readonly schemaVersion: 'tianwen.long-goal-abandon-result.v2'
  readonly action: 'abandoned'
  readonly status: LongGoalStatusProjectionV2
}

export type AnyLongGoalRecord = LongGoalRecord | GoalFirstLongGoalRecord
export type AnyLongGoalStatusProjection = LongGoalStatusProjection | LongGoalStatusProjectionV2
export type AnyLongGoalSummary = LongGoalSummary | LongGoalSummaryV2

export type TianwenLongGoalRpcRequest =
  | { readonly endpoint: 'list'; readonly payload: Record<string, never> }
  | { readonly endpoint: 'create'; readonly payload: {
      readonly objective: string
      readonly tasks: readonly string[]
      readonly maxTaskRounds: number
    } }
  | { readonly endpoint: 'status'; readonly payload: {
      readonly longGoalId: string
    } }
  | { readonly endpoint: 'run-current-task'; readonly payload: {
      readonly longGoalId: string
      readonly initialCwd?: string
    } }
