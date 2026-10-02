import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-llm'

/** Host observation only. Native cancellation and caller file/time bounds own stopping. */
export function observeNativeTaskRequests(ctx: Context, options: {
  readonly rootSessionId: string
  readonly requestsAllowed: boolean
  readonly isPrepared: () => boolean
}) {
  const { rootSessionId, requestsAllowed, isPrepared } = options
  let observed = 0, forwarded = 0, rootForwarded = 0
  const off = ctx.on('llm/stream', async function* (request, next) {
    observed++
    assert(requestsAllowed, 'provider requests forbidden in readonly mode')
    const root = String(request.sessionId) === rootSessionId
    if (root) assert(isPrepared(), 'frozen checker before first native root request')
    forwarded++
    if (root) rootForwarded++
    yield* next()
  })
  return {
    counts: () => ({ observed, forwarded, rootForwarded }),
    dispose: () => { off() },
  }
}
