import type { Context } from '@deepseek-ai/cordis'
import { CallId, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const SMOKE_PROVIDER = 'tianwen-offline' as const
export const SMOKE_MODEL = 'phase2-smoke' as const
export const SMOKE_ACTION = 'tianwen_smoke_action' as const
export const SMOKE_GOAL_OBJECTIVE = 'prove the Tianwen phase 2 startup path' as const
export const SMOKE_FINAL_TEXT = 'TIANWEN_PHASE2_OK' as const

const GOAL_CALL_ID = CallId('tianwen-phase2-goal')
const ACTION_CALL_ID = CallId('tianwen-phase2-action')
const COMPLETE_CALL_ID = CallId('tianwen-phase2-goal-complete')

function textResponse(text: string): readonly StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function toolResponse(
  id: typeof GOAL_CALL_ID,
  toolName: string,
  args: Record<string, unknown>,
): readonly StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call', id, name: toolName,
        arguments: JSON.stringify(args),
      },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function hasTool(options: GenerateOptions, name: string): boolean {
  return options.tools?.some(tool => tool.name === name) ?? false
}

function currentToolResult(options: GenerateOptions, callId: typeof GOAL_CALL_ID) {
  const message = options.messages.findLast(item =>
    item.source.kind === 'tool' && item.source.callId === callId)
  const block = message?.content[0]
  if (message?.role !== 'user'
    || message.source.kind !== 'tool'
    || message.source.callId !== callId
    || message.content.length !== 1
    || block?.type !== 'tool-result'
    || block.toolCallId !== callId
    || block.isError === true) {
    return undefined
  }
  return block
}

function createdGoalRef(options: GenerateOptions): {
  goal_id: string
  revision: number
} | undefined {
  const result = currentToolResult(options, GOAL_CALL_ID)
  const content = result?.content
  if (content?.length !== 1 || content[0]?.type !== 'text') return undefined

  let value: unknown
  try {
    value = JSON.parse(content[0].text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || !('goal' in value)
    || typeof value.goal !== 'object' || value.goal === null
    || !('id' in value.goal) || !('revision' in value.goal)) {
    return undefined
  }
  const { id, revision } = value.goal
  if (typeof id !== 'string' || id.length === 0 || id !== id.trim()
    || typeof revision !== 'number' || !Number.isSafeInteger(revision)
    || revision < 1) return undefined
  return { goal_id: id, revision }
}

function goalRoundRef(options: GenerateOptions): {
  goal_id: string
  revision: number
} | undefined {
  const message = options.messages.findLast(item => item.source.kind === 'goal')
  const source = message?.source
  const block = message?.content[0]
  if (message?.role !== 'user' || source?.kind !== 'goal'
    || message.content.length !== 1 || block?.type !== 'text'
    || !block.text.startsWith('<goal_round>')
    || !block.text.endsWith('</goal_round>')
    || typeof source.goalId !== 'string' || source.goalId.length === 0
    || source.goalId !== source.goalId.trim()
    || !Number.isSafeInteger(source.revision) || source.revision < 1
    || !Number.isSafeInteger(source.round) || source.round < 1) {
    return undefined
  }
  return { goal_id: source.goalId, revision: source.revision }
}

function hasGoalSource(options: GenerateOptions): boolean {
  return options.messages.some(message => message.source.kind === 'goal')
}

export class Phase2SmokeAdapter extends LlmAdapter {
  private cursor = 0
  private mode: 'fresh' | 'resume' | undefined
  private sessionId: GenerateOptions['sessionId']
  private hasSessionId = false
  private goalRef: ReturnType<typeof createdGoalRef>

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.provider !== SMOKE_PROVIDER || options.model !== SMOKE_MODEL) {
      throw new Error('phase 2 smoke adapter requires its fixed provider and model')
    }
    if (!this.hasSessionId) {
      this.sessionId = options.sessionId
      this.hasSessionId = true
    } else if (options.sessionId !== this.sessionId) {
      throw new Error('phase 2 smoke adapter requires one session')
    }
    const goalRef = goalRoundRef(options)
    const requestedMode = goalRef === undefined
      ? (hasGoalSource(options) ? 'invalid' : undefined)
      : 'resume'
    if (requestedMode === 'invalid') {
      throw new Error('phase 2 smoke resume requires a valid goal-round message')
    }
    if (this.mode !== undefined && requestedMode !== undefined
      && this.mode !== requestedMode) {
      throw new Error('phase 2 smoke adapter cannot mix fresh and resume modes')
    }
    const mode = this.mode ?? requestedMode ?? 'fresh'
    if (this.mode === undefined) {
      this.mode = mode
    } else if (this.mode !== mode) {
      throw new Error('phase 2 smoke adapter cannot mix fresh and resume modes')
    }
    if (mode === 'fresh'
      && (!hasTool(options, 'create_goal') || !hasTool(options, SMOKE_ACTION)
        || !hasTool(options, 'update_goal'))) {
      throw new Error('phase 2 smoke adapter requires its fixed tools')
    }
    if (mode === 'resume' && !hasTool(options, 'update_goal')) {
      throw new Error('phase 2 smoke resume requires the update_goal tool')
    }

    let response: readonly StreamChunk[]
    if (mode === 'resume') {
      switch (this.cursor) {
        case 0:
          response = toolResponse(COMPLETE_CALL_ID, 'update_goal', {
            ...goalRef,
            action: 'complete',
          })
          break
        case 1:
          if (currentToolResult(options, COMPLETE_CALL_ID) === undefined) {
            throw new Error('phase 2 smoke resume expected the goal completion result')
          }
          response = textResponse('TIANWEN_RESUME_OK')
          break
        default:
          throw new Error('phase 2 smoke resume script exhausted')
      }
      this.cursor += 1
      yield* response
      return
    }

    switch (this.cursor) {
      case 0:
        response = toolResponse(GOAL_CALL_ID, 'create_goal', {
          objective: SMOKE_GOAL_OBJECTIVE,
          max_goal_rounds: 1,
        })
        break
      case 1:
        this.goalRef = createdGoalRef(options)
        if (this.goalRef === undefined) {
          throw new Error('phase 2 smoke expected a valid goal result')
        }
        response = toolResponse(ACTION_CALL_ID, SMOKE_ACTION, {})
        break
      case 2:
        if (currentToolResult(options, ACTION_CALL_ID) === undefined
          || this.goalRef === undefined) {
          throw new Error('phase 2 smoke expected the action result')
        }
        response = toolResponse(COMPLETE_CALL_ID, 'update_goal', {
          ...this.goalRef,
          action: 'complete',
        })
        break
      case 3:
        if (currentToolResult(options, COMPLETE_CALL_ID) === undefined) {
          throw new Error('phase 2 smoke expected the goal completion result')
        }
        response = textResponse(SMOKE_FINAL_TEXT)
        break
      default:
        throw new Error('phase 2 smoke script exhausted')
    }

    this.cursor += 1
    yield* response
  }
}

export const name = 'tianwen-phase2-smoke'
export const inject = ['llm', 'tools'] as const

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter([SMOKE_PROVIDER], new Phase2SmokeAdapter())
  ctx.tools.register(defineTool({
    name: SMOKE_ACTION,
    description: 'Return the fixed Tianwen Phase 2 startup receipt value.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return 'phase2-smoke-action-ok'
    },
  }))
}
