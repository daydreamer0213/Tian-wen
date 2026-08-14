import { CallId, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'

export type ScriptEntry =
  | readonly StreamChunk[]
  | Error
  | ((request: GenerateOptions) => readonly StreamChunk[])

export class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: ScriptEntry[]) {
    super()
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const entry = this.script.shift()
    if (entry === undefined) {
      throw new Error('ScriptedAdapter: script exhausted')
    }
    if (entry instanceof Error) {
      throw entry
    }
    const chunks = typeof entry === 'function' ? entry(options) : entry
    for (const chunk of chunks) {
      yield chunk
    }
  }
}

export function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

export function toolCallResponse(
  id: string,
  name: string,
  argumentsValue: Record<string, unknown>,
): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call',
        id: CallId(id),
        name,
        arguments: JSON.stringify(argumentsValue),
      },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}
