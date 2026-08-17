import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'

class ProfileProbeAdapter extends LlmAdapter {
  override async *stream(
    _options: GenerateOptions,
  ): AsyncIterable<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield {
      type: 'block-end',
      index: 0,
      block: { type: 'text', text: 'tianwen profile probe' },
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'tianwen-probe-adapter'
export const inject = ['llm']

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['tianwen-probe'], new ProfileProbeAdapter())
}
