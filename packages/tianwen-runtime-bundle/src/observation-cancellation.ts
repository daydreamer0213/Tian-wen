/** Shared cancellation boundary; isolated producers may opt into awaiting their cleanup. */
export async function withConversationObservationCancellation<T>(signal: AbortSignal, start: () => Promise<T>, waitsForCleanup = false): Promise<T> {
  signal.throwIfAborted()
  if (waitsForCleanup) {
    const result = await start()
    signal.throwIfAborted()
    return result
  }
  let remove = () => {}
  const cancelled = new Promise<never>((_resolve, reject) => {
    const abort = () => reject(new Error('external check cancelled'))
    signal.addEventListener('abort', abort, { once: true })
    remove = () => signal.removeEventListener('abort', abort)
    if (signal.aborted) abort()
  })
  try { return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return start() }), cancelled]) }
  finally { remove() }
}
