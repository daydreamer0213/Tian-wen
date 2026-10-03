import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { SessionId, createUserMessage } from '@tianwen/dsh-compat'
import { observeNativeTaskRequests } from './native-task-request-observer.ts'
import { withConversationObservationCancellation } from '../packages/tianwen-runtime-bundle/src/conversation-external-check.ts'
import { sealDevelopmentNativeArchive, verifyDevelopmentNativeArchiveSeal } from './development-native-archive-seal.mjs'
import { readDevelopmentNativeArchiveEntries } from './development-native-archive-reader.mjs'
import { summarizeDevelopmentNativeTask } from './development-native-task-result.mjs'
import { formatDevelopmentNativeArchiveStatus } from './development-native-archive-status.mjs'

const archiveNames = ['attempt-started.json', 'task.json', 'root-native.json.gz', 'result.json', 'failure.json', 'cleanup.json']

/** Read original archive bytes separately from the caller's current SDK task. No repairs or execution. */
export async function inspectDevelopmentNativeTaskArchive(ctx, config) {
  const { resultRoot, sessionId, outputPaths, signal } = config
  const maxBytes = config.maxArchiveBytes === undefined ? 64 * 1024 * 1024 : config.maxArchiveBytes
  if (typeof resultRoot !== 'string' || !isAbsolute(resultRoot)) throw new TypeError('resultRoot must be absolute')
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new TypeError('sessionId must be non-blank')
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('maxArchiveBytes must be a positive safe integer')
  // Validate expected paths and the native signal before reading any archive file.
  summarizeDevelopmentNativeTask(undefined, outputPaths)
  AbortSignal.prototype.throwIfAborted.call(signal)
  let remaining = maxBytes
  const readRecord = (name, optional) => {
    signal.throwIfAborted()
    const path = resolve(resultRoot, name)
    try {
      // The seal shares the total budget; reject an oversized file before reading/parsing it.
      if (statSync(path).size > remaining) throw new RangeError('DEV archive exceeds maxArchiveBytes')
      const bytes = readFileSync(path)
      signal.throwIfAborted()
      if (bytes.length > remaining) throw new RangeError('DEV archive exceeds maxArchiveBytes')
      remaining -= bytes.length
      return bytes
    } catch (error) {
      if (optional && error.code === 'ENOENT') return null
      throw error
    }
  }
  const entries = await readDevelopmentNativeArchiveEntries(async name => readRecord(name, true), { signal, maxBytes })
  const seal = JSON.parse(readRecord('archive-seal.json', false).toString('utf8'))
  const verification = verifyDevelopmentNativeArchiveSeal(seal, sessionId, entries)
  signal.throwIfAborted()
  const summary = summarizeDevelopmentNativeTask(ctx.tianwenEvolution.listConversationTasks(sessionId)[0], outputPaths)
  const status = formatDevelopmentNativeArchiveStatus(verification, summary)
  return { verification, summary, status }
}

/** Resolve only these two DEV modules through Runtime's existing public peer. */
export async function loadDevelopmentNativeModules() {
  const paths = ['development-native-file-policy.mjs', 'development-native-task-result.mjs'].map(path => new URL(path, import.meta.url).href)
  const require = createRequire(new URL('../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const peer = pathToFileURL(require.resolve('@tianwen/evolution')).href
  const hooks = registerHooks({ resolve(specifier, context, next) {
    return next(specifier === '@tianwen/evolution' && paths.includes(context.parentURL) ? peer : specifier, context)
  } })
  try {
    const [policy, result] = await Promise.all(paths.map(path => import(path)))
    return { createDevelopmentNativeFilePolicy: policy.createDevelopmentNativeFilePolicy, summarizeDevelopmentNativeTask: result.summarizeDevelopmentNativeTask }
  } finally { hooks.deregister() }
}

/** The caller admits these reviewed policy bytes before mounting the Runtime. */
export function developmentNativeReadDenialProducer() {
  return { id: 'tianwen.development-native-file-policy.v1', digest: 'sha256:' + createHash('sha256').update(readFileSync(new URL('./development-native-file-policy.mjs', import.meta.url))).digest('hex') }
}

/** The same reviewed policy, independently admitted for write/edit denials. */
export function developmentNativeFileMutationDenialProducer() {
  return developmentNativeReadDenialProducer()
}

/** Caller mounts the actual Runtime/checker and owns Context shutdown. No learning or activation decisions here. */
export async function runDevelopmentNativeTask(ctx, config) {
  const { cwd, sessionId, requestText, outputPaths, referencePaths, maxTargetBytes, resultRoot, signal, isPrepared } = config
  const maxArchiveBytes = config.maxArchiveBytes === undefined ? 64 * 1024 * 1024 : config.maxArchiveBytes
  if (!Number.isSafeInteger(maxArchiveBytes) || maxArchiveBytes <= 0) throw new TypeError('maxArchiveBytes must be a positive safe integer')
  assert(isAbsolute(resultRoot)); assert(typeof requestText === 'string' && requestText.trim())
  assert(typeof isPrepared === 'function'); signal?.throwIfAborted()
  const modules = await loadDevelopmentNativeModules()
  const guard = modules.createDevelopmentNativeFilePolicy({ cwd, sessionId, outputPaths, referencePaths, maxTargetBytes }, path => {
    try { return readFileSync(path, 'utf8') } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  })
  const expectedPaths = [...outputPaths], callConfig = structuredClone(config.callConfig)
  modules.summarizeDevelopmentNativeTask(undefined, expectedPaths)
  assert.equal(ctx.tianwenEvolution.listConversationTasks(sessionId).length, 0, 'DEV host requires a fresh native session')
  const id = SessionId(sessionId)
  assert.equal(ctx.agents.get(id), undefined, 'DEV host requires a fresh native session')
  assert.equal(ctx.sessions.get(id), undefined, 'DEV host requires a fresh native session')
  assert(!(await ctx.sessionPersistence.list(signal)).some(header => String(header.id) === sessionId), 'DEV host requires a fresh native session')
  for (const name of [...archiveNames, 'archive-seal.json', 'archive-seal-failure.json']) {
    assert(!existsSync(resolve(resultRoot, name)), 'existing DEV archive cannot belong to a new attempt')
  }
  mkdirSync(resultRoot, { recursive: true })
  const save = (name, value) => writeFileSync(resolve(resultRoot, name + '.json'), JSON.stringify(value, null, 2), { flag: 'wx' })
  // Exclusive marker prevents this host from retrying or overwriting an earlier attempt.
  save('attempt-started', { sessionId, requestText, outputPaths: expectedPaths, referencePaths: [...referencePaths], callConfig, maxArchiveBytes })
  const observation = observeNativeTaskRequests(ctx, { rootSessionId: sessionId, requestsAllowed: true, isPrepared })
  let handle, failure, result, archivedTask, taskSaved = false, nativeSaved = false
  const cancel = () => handle?.agent.cancel({ kind: 'user' })
  const archive = async () => {
    if (!taskSaved) {
      const task = ctx.tianwenEvolution.listConversationTasks(sessionId)[0] ?? null
      save('task', task); archivedTask = structuredClone(task); taskSaved = true
    }
    if (handle && !nativeSaved) {
      await ctx.sessions.flush(handle.agent.session)
      const native = await ctx.sessionPersistence.inspect(SessionId(sessionId))
      writeFileSync(resolve(resultRoot, 'root-native.json.gz'), gzipSync(Buffer.from(JSON.stringify(native))), { flag: 'wx' })
      nativeSaved = true
    }
  }
  try {
    handle = await ctx.agents.create({ sessionId: SessionId(sessionId), meta: { cwd }, agentOptions: callConfig, signal, setup(local) {
      local.tools.presentAs('native'); local.tools.restrict({ allow: ['read', 'write', 'edit'] })
      const nativeGuard = execution => {
        if (String(execution.agent?.session.id) !== sessionId) return
        return guard({ name: execution.name, sessionId, parent: execution.parent, callId: execution.callId, rootCallId: execution.rootCallId, arguments: execution.arguments })
      }
      const observer = ctx.tianwenConversationFileObserver
      if (typeof observer?.guardFiles === 'function') observer.guardFiles(local, developmentNativeFileMutationDenialProducer(), nativeGuard)
      else if (typeof observer?.guardRead === 'function') observer.guardRead(local, developmentNativeReadDenialProducer(), nativeGuard)
      else local.tools.guard(nativeGuard)
    } })
    signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel()
    signal?.throwIfAborted()
    handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: requestText }] }))
    const settle = async () => { await handle.agent.whenIdle(); await ctx.tianwenConversationObserver.whenIdle(); await ctx.tianwenConversationGuidanceLoop.whenIdle() }
    if (signal) await withConversationObservationCancellation(signal, settle)
    else await settle()
    await archive(); signal?.throwIfAborted()
    result = { summary: modules.summarizeDevelopmentNativeTask(archivedTask ?? undefined, expectedPaths), requests: observation.counts() }
    save('result', result)
  } catch (error) {
    failure = error
    let archivalError
    try { await archive() } catch (error) { archivalError = error.message }
    save('failure', { name: error.name, message: error.message, ...(archivalError ? { archivalError } : {}), requests: observation.counts() })
  } finally {
    signal?.removeEventListener('abort', cancel)
    let cleanupError
    try { await handle?.dispose() } catch (error) { cleanupError = error.message; failure ??= error }
    observation.dispose()
    save('cleanup', { cancelled: signal?.aborted === true, ...(cleanupError ? { cleanupError } : {}), requests: observation.counts(), contextRetained: true })
  }
  try {
    // Execution cancellation is already archived; this signal only finalizes the archive.
    const entries = await readDevelopmentNativeArchiveEntries(async path => {
      try { return readFileSync(resolve(resultRoot, path)) }
      catch (error) { if (error.code === 'ENOENT') return null; throw error }
    }, { signal: new AbortController().signal, maxBytes: maxArchiveBytes })
    save('archive-seal', sealDevelopmentNativeArchive(sessionId, entries))
  } catch (error) {
    try { save('archive-seal-failure', { name: error.name, message: error.message }) }
    catch (diagnosticError) { failure ??= new AggregateError([error, diagnosticError], 'DEV archive seal and its diagnostic could not be saved') }
    failure ??= error
  }
  if (failure) throw failure
  return result
}
