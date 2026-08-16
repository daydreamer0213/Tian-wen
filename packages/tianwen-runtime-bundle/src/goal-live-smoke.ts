export const LIVE_GOAL_OBJECTIVE = 'Call tianwen_smoke_action exactly once. After it succeeds, mark this Goal complete with update_goal, then reply exactly TIANWEN_GOAL_ROUND_OK.' as const
export const LIVE_GOAL_MARKER = 'TIANWEN_GOAL_ROUND_OK' as const
export const LIVE_GOAL_PROVIDER = 'deepseek-official' as const
export const LIVE_GOAL_MODEL = 'deepseek-v4-pro' as const
export const LIVE_GOAL_TOOLS = ['tianwen_smoke_action', 'update_goal'] as const
export const LIVE_GOAL_LIMITS = {
  maxRequests: 3,
  maxOutputTokensPerRequest: 64,
  maxTotalTokens: 32768,
  maxCostCny: 0.25,
  timeoutMs: 90000,
  maxRetries: 0,
} as const

export const LIVE_GOAL_FAILURE_CODES = [
  'preflight-rejected',
  'selection-mismatch',
  'credential-missing',
  'request-limit-exceeded',
  'provider-error',
  'timeout',
  'usage-invalid',
  'token-budget-exceeded',
  'tool-contract-violated',
  'goal-not-complete',
  'marker-mismatch',
  'persistence-unavailable',
  'internal-error',
] as const

export type GoalLiveSmokeFailureCode = typeof LIVE_GOAL_FAILURE_CODES[number]

export interface GoalLiveSmokeFailureReceipt {
  readonly schemaVersion: 'tianwen.goal-live-smoke.v1'
  readonly status: 'failed'
  readonly failureCode: GoalLiveSmokeFailureCode
  readonly timestamp: string
  readonly provider: typeof LIVE_GOAL_PROVIDER
  readonly model: typeof LIVE_GOAL_MODEL
  readonly limits: typeof LIVE_GOAL_LIMITS
  readonly requestCount: number | null
  readonly retryCount: number | null
  readonly markerMatched: false
}

export interface GoalLiveSmokeSuccessReceipt {
  readonly schemaVersion: 'tianwen.goal-live-smoke.v1'
  readonly status: 'succeeded'
  readonly timestamp: string
  readonly provider: typeof LIVE_GOAL_PROVIDER
  readonly model: typeof LIVE_GOAL_MODEL
  readonly limits: typeof LIVE_GOAL_LIMITS
  readonly requestCount: number
  readonly retryCount: number
  readonly markerMatched: true
}

export type GoalLiveSmokeReceipt =
  | GoalLiveSmokeFailureReceipt
  | GoalLiveSmokeSuccessReceipt

export interface GoalLiveSmokeFailureOptions {
  readonly now?: Date
  readonly requestCount?: number | null
  readonly retryCount?: number | null
  // Deliberately ignored: callers must not launder unverified CLI/provider data.
  readonly goalId?: string
  readonly sessionId?: string
  readonly objective?: string
  readonly error?: string
}

export function createGoalLiveSmokeFailure(
  failureCode: GoalLiveSmokeFailureCode,
  options: GoalLiveSmokeFailureOptions = {},
): GoalLiveSmokeFailureReceipt {
  return {
    schemaVersion: 'tianwen.goal-live-smoke.v1',
    status: 'failed',
    failureCode,
    timestamp: (options.now ?? new Date()).toISOString(),
    provider: LIVE_GOAL_PROVIDER,
    model: LIVE_GOAL_MODEL,
    limits: LIVE_GOAL_LIMITS,
    requestCount: options.requestCount === undefined ? 0 : options.requestCount,
    retryCount: options.retryCount === undefined ? 0 : options.retryCount,
    markerMatched: false,
  }
}

function hasFixedLimits(value: unknown): boolean {
  return value !== null && typeof value === 'object' &&
    Object.keys(value).length === Object.keys(LIVE_GOAL_LIMITS).length &&
    Object.entries(LIVE_GOAL_LIMITS).every(([key, expected]) =>
      (value as Record<string, unknown>)[key] === expected)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every(key => key in value)
}

function isGoalLiveSmokeFailureReceipt(value: unknown): value is GoalLiveSmokeFailureReceipt {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const receipt = value as Record<string, unknown>
  return hasExactKeys(receipt, [
    'schemaVersion', 'status', 'failureCode', 'timestamp', 'provider', 'model',
    'limits', 'requestCount', 'retryCount', 'markerMatched',
  ]) && receipt.schemaVersion === 'tianwen.goal-live-smoke.v1' &&
    receipt.status === 'failed' &&
    typeof receipt.timestamp === 'string' &&
    !Number.isNaN(Date.parse(receipt.timestamp)) &&
    receipt.provider === LIVE_GOAL_PROVIDER &&
    receipt.model === LIVE_GOAL_MODEL &&
    hasFixedLimits(receipt.limits) &&
    LIVE_GOAL_FAILURE_CODES.includes(receipt.failureCode as GoalLiveSmokeFailureCode) &&
    (typeof receipt.requestCount === 'number' || receipt.requestCount === null) &&
    (typeof receipt.retryCount === 'number' || receipt.retryCount === null) &&
    receipt.markerMatched === false
}

function isGoalLiveSmokeSuccessReceipt(value: unknown): value is GoalLiveSmokeSuccessReceipt {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const receipt = value as Record<string, unknown>
  return hasExactKeys(receipt, [
    'schemaVersion', 'status', 'timestamp', 'provider', 'model', 'limits',
    'requestCount', 'retryCount', 'markerMatched',
  ]) && receipt.schemaVersion === 'tianwen.goal-live-smoke.v1' &&
    receipt.status === 'succeeded' &&
    typeof receipt.timestamp === 'string' &&
    !Number.isNaN(Date.parse(receipt.timestamp)) &&
    receipt.provider === LIVE_GOAL_PROVIDER &&
    receipt.model === LIVE_GOAL_MODEL &&
    hasFixedLimits(receipt.limits) &&
    typeof receipt.requestCount === 'number' &&
    typeof receipt.retryCount === 'number' && receipt.markerMatched === true
}

/** Accepts a single bounded, sanitized receipt line; raw child stderr is never retained. */
export function parseGoalLiveSmokeChildReceipt(
  stdout: string,
  _stderr: string,
): GoalLiveSmokeReceipt {
  if (Buffer.byteLength(stdout) > 65_536) {
    return createGoalLiveSmokeFailure('internal-error', {
      requestCount: null, retryCount: null,
    })
  }
  const lines = stdout.endsWith('\n')
    ? stdout.slice(0, -1).split('\n')
    : []
  if (lines.length !== 1 || lines[0] === undefined || lines[0].length === 0) {
    return createGoalLiveSmokeFailure('internal-error', {
      requestCount: null, retryCount: null,
    })
  }
  try {
    const receipt: unknown = JSON.parse(lines[0])
    return isGoalLiveSmokeFailureReceipt(receipt) || isGoalLiveSmokeSuccessReceipt(receipt)
      ? receipt
      : createGoalLiveSmokeFailure('internal-error', {
        requestCount: null, retryCount: null,
      })
  } catch {
    return createGoalLiveSmokeFailure('internal-error', {
      requestCount: null, retryCount: null,
    })
  }
}
