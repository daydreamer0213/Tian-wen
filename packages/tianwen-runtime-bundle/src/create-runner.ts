import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'

export interface CreateConfig {
  readonly json: boolean
  readonly maxGoalRounds: number
  readonly nonce: string
  readonly objective: string
}

export interface GoalCreateReceipt {
  readonly schemaVersion: 'tianwen.goal-create.v1'
  readonly goal: {
    readonly id: string
    readonly maxGoalRounds: number
    readonly objective: string
    readonly phase: string
    readonly revision: number
    readonly roundsStarted: number
  }
  readonly session: {
    readonly eventCount: number
    readonly id: string
    readonly modelRequestsDelta: 0
  }
}

function requireConfig(config: CreateConfig): void {
  if (
    config.objective.trim().length === 0 || config.objective !== config.objective.trim() ||
    !Number.isSafeInteger(config.maxGoalRounds) || config.maxGoalRounds < 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      .test(config.nonce)
  ) throw new Error('invalid Tianwen create invocation')
}

function requestCount(events: readonly { readonly type: string }[]): number {
  return events.filter(event => event.type === 'step/start').length
}

export async function runGoalCreate(
  ctx: Context,
  config: CreateConfig,
): Promise<GoalCreateReceipt> {
  requireConfig(config)
  const defaultModel = ctx.get('agentDefaultModel') as {
    currentSelection(): ModelSelection
  } | undefined
  if (defaultModel === undefined) throw new Error('Tianwen Profile has no default model')
  const selection = defaultModel.currentSelection()
  const sessionId = SessionId(`tianwen-goal-${config.nonce}`)
  const handle = await ctx.agents.create({
    sessionId,
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: agentCtx => {
      installModelSelection(agentCtx, { current: selection, assembled: undefined })
    },
  })
  try {
    const requestsBefore = requestCount(handle.agent.session.events)
    const goal = ctx.goals.create(handle.agent, {
      objective: config.objective,
      maxGoalRounds: config.maxGoalRounds,
    })
    await ctx.sessions.flush(handle.agent.session)
    const modelRequestsDelta = requestCount(handle.agent.session.events) - requestsBefore
    if (modelRequestsDelta !== 0) throw new Error('Goal creation requested a model')
    return {
      schemaVersion: 'tianwen.goal-create.v1',
      goal: {
        id: String(goal.id),
        maxGoalRounds: goal.maxGoalRounds,
        objective: goal.objective,
        phase: goal.phase,
        revision: goal.revision,
        roundsStarted: goal.roundsStarted,
      },
      session: {
        eventCount: handle.agent.session.events.length,
        id: String(sessionId),
        modelRequestsDelta: 0,
      },
    }
  } finally {
    await handle.dispose()
  }
}

export const name = 'tianwen-create-runner'
export const inject = ['agentDefaultModel', 'agents', 'goals', 'sessions'] as const

export function apply(ctx: Context, config: CreateConfig): void {
  const exit = ctx.get('appExit') as ((code: number) => void) | undefined
  if (exit === undefined) throw new Error('tianwen-create-runner: appExit is unavailable')
  runGoalCreate(ctx, config).then(receipt => {
    process.stdout.write(config.json
      ? `${JSON.stringify(receipt)}\n`
      : [
        `Created Goal ${receipt.goal.id}: ${receipt.goal.objective}`,
        `Next: tianwen resume --goal ${receipt.goal.id}`,
        '',
      ].join('\n'))
    exit(0)
  }, error => {
    process.stderr.write(`tianwen create: ${error instanceof Error ? error.message : 'failed'}\n`)
    exit(1)
  })
}
