import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { developmentNativeReadDenialProducer, developmentNativeFileMutationDenialProducer, loadDevelopmentNativeModules, runDevelopmentNativeTask } from '../../../scripts/development-native-task.mjs'
import { verifyDevelopmentNativeArchiveSeal } from '../../../scripts/development-native-archive-seal.mjs'

const scenario = process.argv[2], base = process.platform === 'win32' ? 'D:/DevData' : '/tmp'
assert(['peer', 'original', 'permissions', 'file-guard', 'flush-error', 'cancel', 'review-cancel', 'prior-session', 'rerun', 'durable-session', 'live-session', 'stale-task', 'stale-native', 'stale-seal', 'stale-seal-failure', 'seal-write-error', 'seal-prior-error', 'archive-limit-invalid', 'archive-limit', 'archive-limit-prior-error'].includes(scenario))
const original = { source: { taskId: 'control-task' }, completion: { status: 'completed', files: { outputPaths: ['second.mjs', 'first.mjs'] } }, externalCheckPrepared: { checkerId: 'control-check' }, externalCheckFinished: { status: 'verified' }, review: { verdict: 'inconclusive' } }
const native = { header: { id: 'control-session' }, events: [] }, log = [], guards = []
const resultRoot = mkdtempSync(resolve(base, 'tianwen-native-host-unit-')), cancellation = new AbortController()
let submitted
const local = { tools: { presentAs: value => log.push(value), restrict: () => {}, guard: fn => guards.push(fn) } }
const handle = { agent: { session: native, followup: message => { submitted = message }, cancel: () => log.push('cancel'), whenIdle: async () => { if (scenario === 'cancel') cancellation.abort(); log.push('root-idle') } }, dispose: async () => { if (scenario === 'seal-write-error' || scenario === 'seal-prior-error') mkdirSync(resolve(resultRoot, 'archive-seal.json')); log.push('dispose') } }
const ctx = { on: () => () => log.push('observer-off'), agents: { get: () => undefined, create: async config => { config.setup(local); return handle } }, tianwenConversationObserver: { whenIdle: async () => { if (scenario === 'review-cancel') { setTimeout(() => cancellation.abort(), 10); await new Promise(() => {}) } log.push('observer-idle') } }, tianwenConversationGuidanceLoop: { whenIdle: async () => log.push('guidance-idle') }, tianwenEvolution: { listConversationTasks: () => submitted || scenario === 'prior-session' ? [original] : [] }, sessions: { get: () => scenario === 'live-session' ? native : undefined, flush: async () => { if (['flush-error', 'seal-prior-error', 'archive-limit-prior-error'].includes(scenario)) throw new Error('flush-control-error') } }, sessionPersistence: { list: async () => scenario === 'durable-session' ? [{ id: 'control-session' }] : [], inspect: async () => native } }
const config = { cwd: resolve('.'), sessionId: 'control-session', requestText: 'ordinary control request', outputPaths: ['first.mjs', 'second.mjs'], referencePaths: ['reference.md'], maxTargetBytes: 20, resultRoot, callConfig: { provider: 'control', model: 'control' }, isPrepared: () => true, signal: cancellation.signal }
const read = name => JSON.parse(readFileSync(resolve(resultRoot, name + '.json'), 'utf8'))
const assertSeal = complete => {
  const names = ['attempt-started.json', 'task.json', 'root-native.json.gz', 'result.json', 'failure.json', 'cleanup.json']
  const entries = names.filter(name => existsSync(resolve(resultRoot, name))).map(path => ({ path, content: readFileSync(resolve(resultRoot, path)) }))
  assert.deepEqual(verifyDevelopmentNativeArchiveSeal(read('archive-seal'), config.sessionId, entries), { sessionMatches: true, filesMatch: true, complete, missing: [], changed: [], added: [] })
  assert.equal(read('archive-seal').complete, complete)
}
let observedGuardCalls = 0
if (scenario === 'file-guard') ctx.tianwenConversationFileObserver = {
  guardFiles(scope, producer, guard) {
    assert.deepEqual(producer, developmentNativeFileMutationDenialProducer())
    assert.deepEqual(producer, developmentNativeReadDenialProducer())
    return scope.tools.guard(execution => { observedGuardCalls++;return guard(execution) })
  },
  guardRead() { throw new Error('legacy fallback must not replace available file guard') },
}
try {
  if (scenario === 'archive-limit-invalid') {
    for (const maxArchiveBytes of [0, null, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(runDevelopmentNativeTask(ctx, { ...config, maxArchiveBytes }), TypeError)
      assert.equal(submitted, undefined); assert.equal(existsSync(resolve(resultRoot, 'attempt-started.json')), false)
    }
  } else if (scenario === 'archive-limit' || scenario === 'archive-limit-prior-error') {
    await assert.rejects(runDevelopmentNativeTask(ctx, { ...config, maxArchiveBytes: 1 }), scenario === 'archive-limit' ? /maxBytes/ : /flush-control-error/)
    assert.deepEqual(read('task'), original); assert.equal(read('cleanup').contextRetained, true)
    assert.equal(existsSync(resolve(resultRoot, 'archive-seal.json')), false)
    assert.equal(read('archive-seal-failure').name, 'RangeError')
    if (scenario === 'archive-limit-prior-error') assert.equal(read('failure').message, 'flush-control-error')
    else assert.equal(read('result').summary.reviewVerdict, 'inconclusive')
    assert(log.includes('dispose')); assert(log.includes('observer-off'))
  } else if (scenario === 'peer') {
    const modules = await loadDevelopmentNativeModules()
    assert.equal(typeof modules.createDevelopmentNativeFilePolicy, 'function'); assert.equal(typeof modules.summarizeDevelopmentNativeTask, 'function')
    assert.throws(() => modules.createDevelopmentNativeFilePolicy({ cwd: resolve(base), sessionId: 'root', outputPaths: ['bad\ud800.mjs'], referencePaths: [], maxTargetBytes: 20 }, () => null))
  } else if (scenario === 'flush-error') {
    await assert.rejects(runDevelopmentNativeTask(ctx, config), /flush-control-error/)
    assert.deepEqual(read('task'), original); assert.equal(read('failure').message, 'flush-control-error')
    assert.equal(existsSync(resolve(resultRoot, 'result.json')), false); assert(log.includes('dispose'))
    assertSeal(false)
  } else if (scenario === 'seal-write-error' || scenario === 'seal-prior-error') {
    await assert.rejects(runDevelopmentNativeTask(ctx, config), scenario === 'seal-prior-error' ? /flush-control-error/ : /archive-seal/)
    assert.deepEqual(read('task'), original); assert.equal(read('cleanup').contextRetained, true)
    assert.match(read('archive-seal-failure').message, /archive-seal/)
    if (scenario === 'seal-prior-error') assert.equal(read('failure').message, 'flush-control-error')
    else assert.equal(read('result').summary.reviewVerdict, 'inconclusive')
    assert(log.includes('dispose')); assert(log.includes('observer-off'))
  } else if (['prior-session', 'durable-session', 'live-session'].includes(scenario)) {
    await assert.rejects(runDevelopmentNativeTask(ctx, config), /fresh native session/)
    assert.equal(submitted, undefined); assert.equal(existsSync(resolve(resultRoot, 'attempt-started.json')), false)
  } else if (['stale-task', 'stale-native', 'stale-seal', 'stale-seal-failure'].includes(scenario)) {
    const name = { 'stale-task': 'task.json', 'stale-native': 'root-native.json.gz', 'stale-seal': 'archive-seal.json', 'stale-seal-failure': 'archive-seal-failure.json' }[scenario], bytes = Buffer.from('old unrelated archive')
    writeFileSync(resolve(resultRoot, name), bytes)
    await assert.rejects(runDevelopmentNativeTask(ctx, config), /existing DEV archive/)
    assert.equal(submitted, undefined); assert.deepEqual(readFileSync(resolve(resultRoot, name)), bytes)
    assert.equal(existsSync(resolve(resultRoot, 'attempt-started.json')), false)
  } else if (scenario === 'cancel' || scenario === 'review-cancel') {
    await assert.rejects(runDevelopmentNativeTask(ctx, config))
    assert.deepEqual(read('task'), original); assert.equal(read('cleanup').cancelled, true)
    assert(log.includes('cancel')); assert(log.includes('dispose'))
    assertSeal(true)
  } else {
    const before = JSON.stringify(original), result = await runDevelopmentNativeTask(ctx, config)
    assert.deepEqual(read('task'), original)
    assert.deepEqual(JSON.parse(gunzipSync(readFileSync(resolve(resultRoot, 'root-native.json.gz'))).toString()), native)
    assert.equal(result.summary.functionalCandidateVerified, true); assert.equal(result.summary.reviewVerdict, 'inconclusive')
    assert.equal(JSON.stringify(original), before); assert(log.includes('dispose')); assert(log.includes('observer-off'))
    assert.equal(submitted.source.kind, 'user'); assert.equal(submitted.content[0].text, config.requestText)
    assertSeal(true)
    if (scenario === 'rerun') {
      await assert.rejects(runDevelopmentNativeTask(ctx, config), /fresh native session/)
      assert.deepEqual(read('task'), original); assert.equal(read('cleanup').cancelled, false)
    }
    if (scenario === 'permissions' || scenario === 'file-guard') {
      const guard = guards[0], call = { name: 'write', agent: { session: { id: 'control-session' } }, callId: 'c', rootCallId: 'c', arguments: { file_path: 'first.mjs', content: 'x' } }
      assert.equal(guard(call), undefined); assert.equal(typeof guard({ ...call, rootCallId: 'other' }), 'string')
      assert.equal(guard({ ...call, name: 'structured_output', agent: { session: { id: 'reviewer-session' } } }), undefined)
      assert.equal(typeof guard({ ...call, arguments: { file_path: 'reference.md', content: 'x' } }), 'string')
      if (scenario === 'file-guard') assert.equal(observedGuardCalls, 4)
    }
  }
  console.log(JSON.stringify({ passed: true, scenario, modelRequests: 0 }))
} finally {
  const child = relative(base, resultRoot)
  assert(!isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep)); assert(child.startsWith('tianwen-native-host-unit-'))
  rmSync(resultRoot, { recursive: true })
}
