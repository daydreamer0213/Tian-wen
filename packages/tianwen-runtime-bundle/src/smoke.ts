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

function lastToolResultCallId(options: GenerateOptions): typeof GOAL_CALL_ID | undefined {
  for (const message of options.messages.toReversed()) {
    for (const block of message.content.toReversed()) {
      if (block.type === 'tool-result') return block.toolCallId
    }
  }
}

export class Phase2SmokeAdapter extends LlmAdapter {
  private cursor = 0
  private sessionId: GenerateOptions['sessionId']
  private hasSessionId = false

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
    if (!hasTool(options, 'create_goal') || !hasTool(options, SMOKE_ACTION)) {
      throw new Error('phase 2 smoke adapter requires its fixed tools')
    }

    let response: readonly StreamChunk[]
    switch (this.cursor) {
      case 0:
        response = toolResponse(GOAL_CALL_ID, 'create_goal', {
          objective: SMOKE_GOAL_OBJECTIVE,
          max_goal_rounds: 1,
        })
        break
      case 1:
        if (lastToolResultCallId(options) !== GOAL_CALL_ID) {
          throw new Error('phase 2 smoke expected the goal result')
        }
        response = textResponse('goal created')
        break
      case 2:
        if (!options.messages.some(message => message.role === 'user'
          && message.source.kind === 'goal')) {
          throw new Error('phase 2 smoke expected a goal round')
        }
        response = toolResponse(ACTION_CALL_ID, SMOKE_ACTION, {})
        break
      case 3:
        if (lastToolResultCallId(options) !== ACTION_CALL_ID) {
          throw new Error('phase 2 smoke expected the action result')
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
