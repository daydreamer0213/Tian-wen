import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { sha256, baselineGuidanceSnapshot, guidanceVersion, guidanceInputDigest, type GuidanceStudyBody } from '../../packages/tianwen-evolution/src/index.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { recoverConversationTaskMaterial } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { prepareConversationStudyResultChecks, evaluateConversationStudyResultCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'
import { createConversationIsolatedPythonCheck, createConversationStudyIsolatedPythonCheck } from '../../scripts/conversation-isolated-python-check.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'
const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const fileTools = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-tool-fs')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const base = process.env.TIANWEN_ISOLATED_PROBE_ROOT ?? 'D:/DevData/tianwen-isolated-functional-producer-20261001'
const condition = 'Return the exact integer successor as JSON with exit code zero and no stderr.'
const requestText = `Create task.py using contract.md. ${condition}`
const source = 'import json,sys\nx=json.load(sys.stdin)\nprint(json.dumps({"n":x["n"]+1}))'
const isolated = { cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
  imageRef: 'python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7',
  imageId: 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7', workRoot: base + '/native-controls' }
// Deliberate host opt-in; engine must already be running with this cached pinned image.
it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')('persists an ordinary native functional result and cold-recovers it without executing again', async () => {
  mkdirSync(base + '/test-roots', { recursive: true }); const cwd = mkdtempSync(join(base, 'test-roots/native-'))
  writeFileSync(join(cwd, 'contract.md'), condition)
  const config = { cwd, requestText, targetPath: 'task.py', referencePaths: ['contract.md'], isolated, requiredCondition: condition,
    cases: [{ id: 'exact-integer', input: '{"n":9007199254740992}', expectedJson: '{"n":9007199254740993}', exitCode: 0 }] }
  const admission = { kind: 'task', objective: 'Create the requested CLI', criteria: [condition], family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null }
  const review = { verdict: 'met', category: null, explanation: 'The requested source is saved.', evidenceQuotes: ['saved'] }
  const script = [toolCallResponse('admit', 'structured_output', { decision: admission }),
    toolCallResponse('read-contract', 'read', { file_path: 'contract.md' }), toolCallResponse('read-absent', 'read', { file_path: 'task.py' }),
    toolCallResponse('write-source', 'write', { file_path: 'task.py', content: source }), textResponse('saved'), auditedEvidenceResponse(review), auditedEvidenceResponse(review)]
  let preparations = 0, evaluations = 0
  const producer = createConversationIsolatedPythonCheck(config)
  const check = { async prepare(material: Parameters<typeof producer.prepare>[0]) { preparations++
    const prepared = await producer.prepare(material)
    if (prepared === undefined) return undefined
    return { ...prepared, async evaluate(candidate: Parameters<typeof prepared.evaluate>[0]) { evaluations++; return prepared.evaluate(candidate) } }
  } }
  async function mount(resume: boolean) {
    const harness = await mountPersistentHarness(join(cwd, 'sessions'), resume ? [] : script)
    await harness.ctx.plugin(localFs.default, { cwd }); await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' }); await harness.ctx.plugin(fileTools, {})
    await applyRuntime(harness.ctx, { evolutionRoot: join(cwd, 'evolution') })
    if (!resume) harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
    await harness.ctx.plugin(TianwenConversationFileObserverService, { externalCodeArtifacts: true })
    await harness.ctx.plugin(TianwenConversationObserverService, resume ? {} : { externalCodeCheck: check })
    const handle = resume ? await harness.ctx.agents.resume({ resumeSessionId: SessionId('isolated-native'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
      : await harness.ctx.agents.create({ sessionId: SessionId('isolated-native'), meta: { cwd }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
    return { ...harness, handle }
  }
  const native = await mount(false)
  try {
    native.handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: requestText }] }))
    await native.handle.agent.whenIdle(); await native.ctx.tianwenConversationObserver.whenIdle()
    const task = native.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.externalCheckFinished?.status).toBe('verified'); expect(task.fileUnavailable).toBeUndefined(); expect(preparations).toBe(1); expect(evaluations).toBe(1)
    const material = await recoverConversationTaskMaterial(native.ctx, task), ledger = readFileSync(join(cwd, 'evolution/ledger.jsonl'))
    expect(material.files?.entries).toEqual([{ path: 'contract.md', content: condition }, { path: 'task.py', content: null }])
    await native.handle.dispose(); await native.ctx.fiber.dispose()
    const cold = await mount(true)
    try {
      expect(cold.ctx.tianwenEvolution.listConversationTasks()[0]).toEqual(task)
      expect(await recoverConversationTaskMaterial(cold.ctx, task)).toEqual(material)
      expect(cold.adapter.requests).toHaveLength(0); expect(readFileSync(join(cwd, 'evolution/ledger.jsonl'))).toEqual(ledger)
      expect(evaluations).toBe(1); expect(preparations).toBe(1)
      writeFileSync(base + '/native-functional-control.json', JSON.stringify({ controlled: true, realDocker: true, modelCalls: 0, naturalSources: 0,
        preparedOnce: true, evaluatedOnce: true, coldRequests: 0, taskId: task.source.taskId, status: task.externalCheckFinished?.status, ledgerDigest: sha256(ledger.toString('utf8')) }), { flag: 'wx' })
    } finally { await cold.handle.dispose(); await cold.ctx.fiber.dispose() }
  } finally { await native.handle.dispose(); await native.ctx.fiber.dispose(); rmSync(cwd, { recursive: true, force: true }) }
}, 60_000)

it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')('connects saved study material to five real isolated checks across both arms', async () => {
  const cwd = base + '/nonexistent-original-study', ids = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
  const config = { cwd, requestText, targetPath: 'task.py', referencePaths: ['contract.md'], isolated: { ...isolated, workRoot: base + '/study-controls' }, requiredCondition: condition, criteria: [condition],
    cases: [{ id: 'exact-integer', input: '{"n":9007199254740992}', expectedJson: '{"n":9007199254740993}', exitCode: 0 }] }
  const materials = ids.map((id, index) => ({ prompt: requestText, criteria: [condition], files: {
    schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'files' as const, cwd,
    entries: [{ path: 'task.py', content: index < 2 ? `print("{}") # ${id}` : source + `\n# ${id}` }, { path: 'contract.md', content: condition }], outputPaths: ['task.py'],
  } }))
  const parentSnapshot = baselineGuidanceSnapshot('isolated-functional-controlled')
  const body: GuidanceStudyBody = { scopeKey: parentSnapshot.scopeKey, parentSnapshot, parentVersion: guidanceVersion(parentSnapshot), family: 'code',
    evaluationMode: 'local-files', fileOutputKind: 'files', consentRevision: 1, failureCategory: 'instruction-following', sourceTaskIds: ['controlled-one', 'controlled-two'],
    counterexampleTaskId: 'controlled-three', modelConfigDigest: sha256('controlled-model'), cases: materials.map((material, index) => index < 3
      ? { id: ids[index]!, kind: (['source1', 'source2', 'counterexample'] as const)[index]!, sourceTaskId: ['controlled-one', 'controlled-two', 'controlled-three'][index]!, materialDigest: sha256(material), inputDigest: guidanceInputDigest(requestText, material.files) }
      : { id: ids[index]!, kind: index === 3 ? 'adjacent' : 'holdout', ...material, materialDigest: sha256(material), inputDigest: guidanceInputDigest(requestText, material.files) }) }
  const producer = createConversationStudyIsolatedPythonCheck(config), signal = new AbortController().signal
  let preparations = 0
  const prepared = await prepareConversationStudyResultChecks({ async prepare(material) { preparations++; return producer.prepare(material) } }, body, materials, signal)
  const statuses: string[] = []
  for (const [index, material] of materials.entries()) {
    const baseline = await evaluateConversationStudyResultCheck(prepared, ids[index]!, { answer: '', files: material.files.entries }, signal)
    expect(baseline.status).toBe(index < 2 ? 'rejected' : 'verified'); statuses.push(baseline.status)
    const candidate = await evaluateConversationStudyResultCheck(prepared, ids[index]!, { answer: '', files: material.files.entries.map(entry => entry.path === 'task.py' ? { ...entry, content: source } : entry) }, signal)
    expect(candidate.status).toBe('verified'); statuses.push(candidate.status)
  }
  expect(preparations).toBe(5)
  writeFileSync(base + '/study-functional-control.json', JSON.stringify({ controlled: true, realDocker: true, modelCalls: 0, naturalSources: 0, preparations, evaluations: 10, statuses, bodyDigest: sha256(body), checks: prepared.checks }), { flag: 'wx' })
}, 60_000)
