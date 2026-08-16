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
  readonly status: 'passed'
  readonly timestamp: string
  readonly provider: typeof LIVE_GOAL_PROVIDER
  readonly model: typeof LIVE_GOAL_MODEL
  readonly limits: typeof LIVE_GOAL_LIMITS
  readonly requestCount: number
  readonly retryCount: number
  readonly markerMatched: true
  readonly goal: {
    readonly id: string
    readonly revision: number
    readonly phase: 'complete'
    readonly roundsStarted: number
  }
  readonly session: {
    readonly id: string
    readonly eventCountDelta: number
  }
  readonly usage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly cacheReadTokens: number
    readonly cacheWriteTokens: number
    readonly totalTokens: number
    readonly estimatedCostCny: number
  }
  readonly evidence: readonly {
    readonly evidenceId: string
    readonly toolName: typeof LIVE_GOAL_TOOLS[number]
    readonly outcome: 'complete'
  }[]
  readonly governance: {
    readonly evolutionUnchanged: true
    readonly championUnchanged: true
  }
}

export type GoalLiveSmokeReceipt =
  | GoalLiveSmokeFailureReceipt
  | GoalLiveSmokeSuccessReceipt

export interface LiveGoalExpectedRef {
  readonly id: string
  readonly revision: number
}

export type LiveGoalEventAssessment =
  | {
    readonly ok: true
    readonly usage: GoalLiveSmokeSuccessReceipt['usage']
  }
  | {
    readonly ok: false
    readonly failureCode: Extract<GoalLiveSmokeFailureCode,
      'usage-invalid' | 'token-budget-exceeded' | 'tool-contract-violated' | 'marker-mismatch'>
  }

function usageIsValid(value: unknown): value is Record<string, number | undefined> {
  if (value === null || typeof value !== 'object') return false
  return ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].every(key => {
    const count = (value as Record<string, unknown>)[key]
    return count === undefined || (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)
  }) && ['inputTokens', 'outputTokens'].every(key =>
    (value as Record<string, unknown>)[key] !== undefined)
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Assess only the bounded Session delta; it never returns model text or tool payloads. */
export function assessLiveGoalEvents(
  _sessionId: string,
  addedEvents: readonly SessionEvent[],
  expectedGoal: LiveGoalExpectedRef,
): LiveGoalEventAssessment {
  const assistants = addedEvents.filter(event => event.type === 'assistant/message')
  if (assistants.length !== LIVE_GOAL_LIMITS.maxRequests) {
    return { ok: false, failureCode: 'usage-invalid' }
  }
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  for (const assistant of assistants) {
    if (!usageIsValid(assistant.data.usage)) return { ok: false, failureCode: 'usage-invalid' }
    inputTokens += assistant.data.usage.inputTokens!
    outputTokens += assistant.data.usage.outputTokens!
    cacheReadTokens += assistant.data.usage.cacheReadTokens ?? 0
    cacheWriteTokens += assistant.data.usage.cacheWriteTokens ?? 0
  }
  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
  if (totalTokens > LIVE_GOAL_LIMITS.maxTotalTokens) {
    return { ok: false, failureCode: 'token-budget-exceeded' }
  }

  const calls = addedEvents.filter(event => event.type === 'tool/call')
  const results = addedEvents.filter(event => event.type === 'tool/result')
  if (calls.length !== 2 || results.length !== 2 ||
    calls.map(event => event.data.name).join(',') !== LIVE_GOAL_TOOLS.join(',')) {
    return { ok: false, failureCode: 'tool-contract-violated' }
  }
  let updateArguments: unknown
  try {
    updateArguments = JSON.parse(calls[1]!.data.arguments)
  } catch {
    return { ok: false, failureCode: 'tool-contract-violated' }
  }
  if (calls[0]!.data.arguments !== '{}' || !equalJson(updateArguments, {
    goal_id: expectedGoal.id,
    revision: expectedGoal.revision,
    action: 'complete',
  })) return { ok: false, failureCode: 'tool-contract-violated' }
  for (const [index, call] of calls.entries()) {
    const result = results.find(item =>
      String(item.data.message.source.callId) === String(call.data.callId))
    if (result === undefined || result.seq <= call.seq || result.data.error !== undefined ||
      (index === 1 && result.seq <= results[0]!.seq)) {
      return { ok: false, failureCode: 'tool-contract-violated' }
    }
  }
  const finalContent = assistants.at(-1)!.data.message.content
  if (finalContent.length !== 1 || finalContent[0]?.type !== 'text' ||
    finalContent[0].text !== LIVE_GOAL_MARKER) {
    return { ok: false, failureCode: 'marker-mismatch' }
  }
  return {
    ok: true,
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens,
      estimatedCostCny: (
        inputTokens * 3 + cacheReadTokens * 0.025 + cacheWriteTokens * 3 + outputTokens * 6
      ) / 1_000_000,
    },
  }
}

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
    'requestCount', 'retryCount', 'markerMatched', 'goal', 'session', 'usage',
    'evidence', 'governance',
  ]) && receipt.schemaVersion === 'tianwen.goal-live-smoke.v1' &&
    receipt.status === 'passed' &&
    typeof receipt.timestamp === 'string' &&
    !Number.isNaN(Date.parse(receipt.timestamp)) &&
    receipt.provider === LIVE_GOAL_PROVIDER &&
    receipt.model === LIVE_GOAL_MODEL &&
    hasFixedLimits(receipt.limits) &&
    typeof receipt.requestCount === 'number' &&
    typeof receipt.retryCount === 'number' && receipt.markerMatched === true &&
    receipt.goal !== null && typeof receipt.goal === 'object' &&
    typeof (receipt.goal as Record<string, unknown>).id === 'string' &&
    Number.isSafeInteger((receipt.goal as Record<string, unknown>).revision) &&
    (receipt.goal as Record<string, unknown>).phase === 'complete' &&
    Number.isSafeInteger((receipt.goal as Record<string, unknown>).roundsStarted) &&
    receipt.session !== null && typeof receipt.session === 'object' &&
    typeof (receipt.session as Record<string, unknown>).id === 'string' &&
    Number.isSafeInteger((receipt.session as Record<string, unknown>).eventCountDelta) &&
    receipt.usage !== null && typeof receipt.usage === 'object' &&
    ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens', 'estimatedCostCny']
      .every(key => typeof (receipt.usage as Record<string, unknown>)[key] === 'number') &&
    Array.isArray(receipt.evidence) && receipt.evidence.length === 2 &&
    receipt.evidence.every(item => item !== null && typeof item === 'object' &&
      typeof (item as Record<string, unknown>).evidenceId === 'string' &&
      LIVE_GOAL_TOOLS.includes((item as Record<string, unknown>).toolName as typeof LIVE_GOAL_TOOLS[number]) &&
      (item as Record<string, unknown>).outcome === 'complete') &&
    receipt.governance !== null && typeof receipt.governance === 'object' &&
    (receipt.governance as Record<string, unknown>).evolutionUnchanged === true &&
    (receipt.governance as Record<string, unknown>).championUnchanged === true
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
import type { SessionEvent } from '@deepseek-ai/dsh-session'
