import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { GoalId } from '@deepseek-ai/dsh-goal'
import { SessionId } from '@deepseek-ai/dsh-session'

interface ResumeConfig {
  readonly goalId: string
  readonly json: boolean
  readonly nonce: string
  readonly revision: number
  readonly sessionId: string
}

interface Receipt {
  readonly schemaVersion: 'tianwen.goal-resume.v1'
  readonly goal: {
    readonly id: string
    readonly revision: number
    readonly phase: string
    readonly roundsStarted: number
  }
  readonly session: {
    readonly id: string
    readonly eventCountAfter: number
    readonly eventCountBefore: number
    readonly eventCountDelta: number
    readonly modelRequestsDelta: number
  }
}

function requireConfig(config: ResumeConfig): void {
  if (
    !config.goalId || !config.sessionId || !config.nonce ||
    !Number.isSafeInteger(config.revision) || config.revision < 1
  ) throw new Error('invalid Tianwen resume invocation')
}

function validateGoal(
  config: ResumeConfig,
  goal: ReturnType<Context['goals']['get']>,
): NonNullable<typeof goal> {
  if (goal === undefined || String(goal.id) !== config.goalId ||
    goal.revision !== config.revision) {
    throw new Error('Goal changed after preflight')
  }
  if (!['active', 'paused', 'blocked'].includes(goal.phase) ||
    goal.roundsStarted >= goal.maxGoalRounds || goal.activation !== 'disarmed') {
    throw new Error('Goal is no longer resumable')
  }
  return goal
}

function receipt(
  goal: NonNullable<ReturnType<Context['goals']['get']>>,
  sessionId: string,
  eventCountBefore: number,
  eventCountAfter: number,
  modelRequestsDelta: number,
): Receipt {
  return {
    schemaVersion: 'tianwen.goal-resume.v1',
    goal: {
      id: String(goal.id),
      revision: goal.revision,
      phase: goal.phase,
      roundsStarted: goal.roundsStarted,
    },
    session: {
      id: sessionId,
      eventCountAfter,
      eventCountBefore,
      eventCountDelta: eventCountAfter - eventCountBefore,
      modelRequestsDelta,
    },
  }
}

async function waitForDisarmed(ctx: Context, agent: Parameters<Context['goals']['get']>[0]) {
  while (true) {
    await agent.whenIdle()
    const goal = ctx.goals.get(agent)
    if (goal !== undefined && goal.activation === 'disarmed') return goal
    await new Promise<void>(resolve => setImmediate(resolve))
  }
}

function requestCount(events: readonly { readonly type: string }[]): number {
  return events.filter(event => event.type === 'step/start').length
}

export async function runGoalResume(
  ctx: Context,
  config: ResumeConfig,
): Promise<Receipt> {
  requireConfig(config)
  const defaultModel = ctx.get('agentDefaultModel') as {
    currentSelection(): ModelSelection
  } | undefined
  if (defaultModel === undefined) {
    throw new Error('Tianwen Profile has no default model')
  }
  const selection = defaultModel.currentSelection()
  const handle = await ctx.agents.resume({
    resumeSessionId: SessionId(config.sessionId),
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: agentCtx => {
      installModelSelection(agentCtx, { current: selection, assembled: undefined })
    },
  })
  try {
    await new Promise<void>(resolve => setImmediate(resolve))
    if (String(handle.agent.id) !== config.sessionId) {
      throw new Error('Session changed after preflight')
    }
    const eventCountBefore = handle.agent.session.events.length
    const requestCountBefore = requestCount(handle.agent.session.events)
    const current = validateGoal(config, ctx.goals.get(handle.agent))
    ctx.goals.resume(handle.agent, { id: GoalId(String(current.id)), revision: current.revision })
    const settled = await waitForDisarmed(ctx, handle.agent)
    await ctx.sessions.flush(handle.agent.session)
    if (settled.phase === 'active') {
      throw new Error('Goal resume did not settle')
    }
    return receipt(
      settled,
      config.sessionId,
      eventCountBefore,
      handle.agent.session.events.length,
      requestCount(handle.agent.session.events) - requestCountBefore,
    )
  } finally {
    await handle.dispose()
  }
}

export const name = 'tianwen-resume-runner'
export const inject = ['agentDefaultModel', 'agents', 'goals', 'sessions'] as const

export function apply(ctx: Context, config: ResumeConfig): void {
  const exit = ctx.get('appExit') as ((code: number) => void) | undefined
  if (exit === undefined) {
    throw new Error('tianwen-resume-runner: appExit is unavailable')
  }
  runGoalResume(ctx, config).then(receipt => {
    process.stdout.write(config.json
      ? `${JSON.stringify(receipt)}\n`
      : `Resumed Goal ${receipt.goal.id} (${receipt.session.eventCountDelta} events)\n`)
    exit(0)
  }, error => {
    process.stderr.write(`tianwen resume: ${error instanceof Error ? error.message : 'failed'}\n`)
    exit(1)
  })
}
