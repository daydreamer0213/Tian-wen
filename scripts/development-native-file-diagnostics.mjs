/** Project original SDK warning records; never evaluate, repair or replay a Task. */
export function collectDevelopmentNativeFileDiagnostics(messages, scope) {
  const records = []
  let observedCount = 0
  if (!Array.isArray(messages) || scope?.fiber == null || typeof scope.taskId !== 'string' || typeof scope.sessionId !== 'string')
    return { records, observedCount, truncated: false }
  for (const message of messages) {
    const meta = message?.args?.[2]
    if (message?.type !== 'warn' || !(message.fiber instanceof WeakRef) || message.fiber.deref() !== scope.fiber
      || !Number.isSafeInteger(message.sn) || message.sn < 1 || !Number.isFinite(message.ts) || message.ts < 0
      || message.args?.[0] !== 'Conversation file observation failed: %s' || typeof message.args[1] !== 'string'
      || meta?.kind !== 'tianwen.file-observation-diagnostic.v1' || meta.taskId !== scope.taskId || meta.sessionId !== scope.sessionId
      || !['prepare', 'capture', 'freeze', 'unavailable-record'].includes(meta.phase)) continue
    observedCount++
    if (records.length === 16) continue
    const detail = [...message.args[1]].slice(0, 512).join('')
    records.push({ sourceSequence: message.sn, sourceTimestamp: message.ts, taskId: meta.taskId, sessionId: meta.sessionId,
      phase: meta.phase, detail, detailTruncated: detail.length !== message.args[1].length })
  }
  return { records, observedCount, truncated: observedCount > records.length }
}
