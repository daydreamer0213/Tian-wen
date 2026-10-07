import { expect, it } from 'vitest'
import { collectDevelopmentNativeFileDiagnostics } from '../../scripts/development-native-file-diagnostics.mjs'

const fiber = {}, other = {}
const scope = { fiber, taskId: 'original-task', sessionId: 'root-session' }
const warning = (sn = 1, detail = 'conversation file ancillary record exceeds its count limit') => ({
  sn, ts: 12345, type: 'warn', fiber: new WeakRef(fiber),
  args: ['Conversation file observation failed: %s', detail, {
    kind: 'tianwen.file-observation-diagnostic.v1', taskId: scope.taskId, sessionId: scope.sessionId, phase: 'freeze',
  }],
})

it('retains a concrete failure only from the actual observer fiber and original task', () => {
  const row = warning(), before = structuredClone(row.args)
  expect(collectDevelopmentNativeFileDiagnostics([row], scope)).toEqual({
    records: [{ sourceSequence: 1, sourceTimestamp: 12345, taskId: scope.taskId, sessionId: scope.sessionId,
      phase: 'freeze', detail: row.args[1], detailTruncated: false }], observedCount: 1, truncated: false,
  })
  expect(row.args).toEqual(before)
})

it('does not attribute another fiber, task, session or ordinary warning to this task', () => {
  const wrongTask = warning(); wrongTask.args[2].taskId = 'other'
  const wrongSession = warning(); wrongSession.args[2].sessionId = 'other'
  const wrongFiber = { ...warning(), fiber: new WeakRef(other) }
  const noMarker = { ...warning(), args: ['ordinary warning', 'not a file observation'] }
  expect(collectDevelopmentNativeFileDiagnostics([wrongTask, wrongSession, wrongFiber, noMarker], scope).records).toEqual([])
})

it('keeps original order and reports bounded diagnostic truncation explicitly', () => {
  const result = collectDevelopmentNativeFileDiagnostics(Array.from({ length: 17 }, (_, i) => warning(i + 1)), scope)
  expect(result.records.map(row => row.sourceSequence)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
  expect(result.observedCount).toBe(17); expect(result.truncated).toBe(true)
})

it('preserves an exact bounded Unicode prefix without persisting raw log objects', () => {
  const detail = '😀'.repeat(513), result = collectDevelopmentNativeFileDiagnostics([warning(1, detail)], scope)
  expect(result.records[0].detail).toBe('😀'.repeat(512)); expect(result.records[0].detailTruncated).toBe(true)
  expect(JSON.stringify(result)).not.toContain('args'); expect(JSON.stringify(result)).not.toContain('fiber')
})

it('handles absent legacy logs or source identity without inventing a diagnostic', () => {
  expect(collectDevelopmentNativeFileDiagnostics(undefined, scope).records).toEqual([])
  expect(collectDevelopmentNativeFileDiagnostics([warning()], { ...scope, fiber: undefined }).records).toEqual([])
})

it('rejects malformed or unqualified source messages', () => {
  expect(collectDevelopmentNativeFileDiagnostics([null, { ...warning(), sn: NaN }, { ...warning(), ts: Infinity },
    { ...warning(), type: 'info' }, { ...warning(), args: ['Conversation file observation failed: %s', { secret: 'not text' }, warning().args[2]] }], scope).records).toEqual([])
})
