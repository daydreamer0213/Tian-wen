import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { inspectDevelopmentNativeTaskArchive } from '../../scripts/development-native-task.mjs'
import { sealDevelopmentNativeArchive } from '../../scripts/development-native-archive-seal.mjs'

function fixture(run) {
  const base = process.platform === 'win32' ? 'D:/DevData' : '/tmp'
  const root = mkdtempSync(resolve(base, 'tianwen-native-inspect-unit-'))
  const entries = ['attempt-started.json', 'task.json', 'root-native.json.gz', 'result.json', 'cleanup.json']
    .map(path => ({ path, content: Buffer.from('raw archive bytes, never SDK state') }))
  for (const entry of entries) writeFileSync(resolve(root, entry.path), entry.content)
  const seal = sealDevelopmentNativeArchive('original-session', entries)
  const saveSeal = value => writeFileSync(resolve(root, 'archive-seal.json'), JSON.stringify(value))
  saveSeal(seal)
  const task = { source: { taskId: 'actual-sdk-task' }, completion: { status: 'completed', files: { outputPaths: ['out.mjs'] } },
    externalCheckPrepared: {}, externalCheckFinished: { status: 'verified' }, review: { verdict: 'inconclusive' } }
  let lookups = 0
  const ctx = { tianwenEvolution: { listConversationTasks(sessionId) { lookups++; assert.equal(sessionId, 'original-session'); return [task] } } }
  const config = { resultRoot: root, sessionId: 'original-session', outputPaths: ['out.mjs'], signal: new AbortController().signal }
  const snapshot = () => Object.fromEntries(readdirSync(root).map(name => [name, readFileSync(resolve(root, name)).toString('base64')]))
  return Promise.resolve().then(() => run({ root, entries, seal, saveSeal, task, ctx, config, snapshot, lookups: () => lookups })).finally(() => {
    const within = relative(resolve(base), resolve(root))
    assert(within && !within.startsWith('..' + sep) && !isAbsolute(within))
    assert(within.startsWith('tianwen-native-inspect-unit-'))
    rmSync(root, { recursive: true, force: true })
  })
}

test('inspection uses current SDK truth and leaves original bytes unchanged', () => fixture(async f => {
  const before = f.snapshot(), taskBefore = structuredClone(f.task)
  const view = await inspectDevelopmentNativeTaskArchive(f.ctx, f.config)
  assert.deepEqual(Object.keys(view), ['verification', 'summary', 'status'])
  assert.equal(view.summary.taskId, 'actual-sdk-task')
  assert.equal(view.summary.functionalCandidateVerified, true)
  assert.equal(view.status.archive, '归档字节一致且文件集合完整')
  assert.equal(view.status.functional, '原程序检查记录：通过')
  assert.equal(view.status.review, '整体评审未定')
  assert.equal(view.status.disposition, '以上为原归档事实，不代表方法已采用或自动学习已完成。')
  f.task.externalCheckInvalidated = { reason: 'later SDK event' }
  const current = await inspectDevelopmentNativeTaskArchive(f.ctx, f.config)
  assert.equal(current.summary.functionalCandidateVerified, false)
  assert.equal(current.status.functional, view.status.functional)
  delete f.task.externalCheckInvalidated
  assert.deepEqual(f.task, taskBefore); assert.deepEqual(f.snapshot(), before)
  assert.equal(f.lookups(), 2)
}))

test('invalid inputs and total bytes including seal fail before SDK lookup', () => fixture(async f => {
  const nonexistent = resolve(f.root, 'never-created')
  for (const invalid of [{ signal: {} }, { signal: undefined }, { sessionId: '' }, { sessionId: ' ' },
    { resultRoot: 'relative' }, { outputPaths: [] }, { outputPaths: ['x', 'x'] }, { maxArchiveBytes: null }, { maxArchiveBytes: 0 }]) {
    await assert.rejects(inspectDevelopmentNativeTaskArchive(f.ctx, { ...f.config, resultRoot: nonexistent, ...invalid }), TypeError)
  }
  const aborted = new AbortController(), reason = new Error('original cancellation')
  aborted.abort(reason)
  await assert.rejects(inspectDevelopmentNativeTaskArchive(f.ctx, { ...f.config, resultRoot: nonexistent, signal: aborted.signal }), error => error === reason)
  const total = f.entries.reduce((sum, entry) => sum + entry.content.length, 0) + readFileSync(resolve(f.root, 'archive-seal.json')).length
  await assert.rejects(inspectDevelopmentNativeTaskArchive(f.ctx, { ...f.config, maxArchiveBytes: total - 1 }), RangeError)
  assert.equal(f.lookups(), 0)
  assert.equal((await inspectDevelopmentNativeTaskArchive(f.ctx, { ...f.config, maxArchiveBytes: total })).verification.complete, true)
}))

test('changed bytes, partial sets and missing seals remain separate facts', () => fixture(async f => {
  writeFileSync(resolve(f.root, 'task.json'), 'invalid JSON, still just bytes')
  const changed = await inspectDevelopmentNativeTaskArchive(f.ctx, f.config)
  assert.deepEqual(changed.verification.changed, ['task.json'])
  assert.equal(changed.status.archive, '归档已变化')
  assert.equal(changed.summary.taskId, 'actual-sdk-task')
  f.saveSeal(sealDevelopmentNativeArchive('original-session', f.entries.filter(entry => entry.path !== 'result.json')))
  rmSync(resolve(f.root, 'result.json'))
  writeFileSync(resolve(f.root, 'task.json'), f.entries.find(entry => entry.path === 'task.json').content)
  assert.equal((await inspectDevelopmentNativeTaskArchive(f.ctx, f.config)).status.archive, '归档文件不完整')
  f.saveSeal({ ...sealDevelopmentNativeArchive('original-session', f.entries.filter(entry => entry.path !== 'result.json')), sessionId: 'other-session' })
  assert.equal((await inspectDevelopmentNativeTaskArchive(f.ctx, f.config)).status.archive, '会话不匹配')
  writeFileSync(resolve(f.root, 'archive-seal.json'), 'invalid seal JSON')
  await assert.rejects(inspectDevelopmentNativeTaskArchive(f.ctx, f.config), SyntaxError)
  rmSync(resolve(f.root, 'archive-seal.json'))
  const before = f.snapshot(), lookups = f.lookups()
  await assert.rejects(inspectDevelopmentNativeTaskArchive(f.ctx, f.config), error => error.code === 'ENOENT')
  assert.equal(f.lookups(), lookups); assert.deepEqual(f.snapshot(), before)
}))

test('displays sealed same-task diagnostics without changing SDK truth or archive bytes', () => fixture(async f => {
  const diagnostic = { records: [{ sourceSequence: 1, sourceTimestamp: 12345, taskId: f.task.source.taskId,
    sessionId: f.config.sessionId, phase: 'freeze', detail: 'original concrete failure', detailTruncated: false }], observedCount: 1, truncated: false }
  const cleanup = f.entries.find(entry => entry.path === 'cleanup.json')
  cleanup.content = Buffer.from(JSON.stringify({ fileObservationDiagnostics: diagnostic }))
  writeFileSync(resolve(f.root, cleanup.path), cleanup.content)
  f.saveSeal(sealDevelopmentNativeArchive(f.config.sessionId, f.entries))
  const before = f.snapshot(), taskBefore = structuredClone(f.task)
  const view = await inspectDevelopmentNativeTaskArchive(f.ctx, f.config)
  assert.deepEqual(view.status.diagnostics, { items: [{ stage: '保存最终文件证据时', detail: 'original concrete failure', detailTruncated: false }],
    observedCount: 1, truncated: false, disposition: '诊断只说明观察失败原因，不改变原任务或学习资格。' })
  assert.equal(view.summary.functionalStatus, 'verified')
  assert.deepEqual(f.task, taskBefore); assert.deepEqual(f.snapshot(), before)

  const foreign = structuredClone(diagnostic); foreign.records[0].taskId = 'other-task'
  cleanup.content = Buffer.from(JSON.stringify({ fileObservationDiagnostics: foreign }))
  writeFileSync(resolve(f.root, cleanup.path), cleanup.content); f.saveSeal(sealDevelopmentNativeArchive(f.config.sessionId, f.entries))
  assert.equal((await inspectDevelopmentNativeTaskArchive(f.ctx, f.config)).status.diagnostics, undefined)
  writeFileSync(resolve(f.root, cleanup.path), JSON.stringify({ fileObservationDiagnostics: diagnostic }))
  const changed = await inspectDevelopmentNativeTaskArchive(f.ctx, f.config)
  assert.equal(changed.verification.complete, false); assert.equal(changed.status.diagnostics, undefined)
  assert.deepEqual(changed.summary, view.summary); assert.deepEqual(f.task, taskBefore)
}))
