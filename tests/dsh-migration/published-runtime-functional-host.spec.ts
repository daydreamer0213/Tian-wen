import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, createUserMessage, mountFeedbackHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const fileTools = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-tool-fs')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)

const base = process.env.TIANWEN_PUBLISHED_HOST_PROBE_ROOT ?? 'D:/DevData/tianwen-reusable-result-checks-20261002/published-host'

it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')('uses published factories in the full Runtime host and cold-recovers without preparing or executing again', async () => {
  // Resolve the built public exports only on explicit opt-in. Default tests
  // must not require generated dist files. The root is not a package consumer;
  // use the package's own public self-reference rather than a new dependency.
  const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const { createConversationIsolatedPythonCheck, createConversationStudyIsolatedPythonCheck } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle')).href)
  const { apply: applyBundle } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle/runtime')).href)
  const roots = resolve(base, 'test-roots')
  mkdirSync(roots, { recursive: true })
  const cwd = mkdtempSync(join(roots, 'host-'))
  const condition = 'Return exactly JSON {"tag":"runtime-host"} with exit code zero and empty stderr.'
  const requestText = `Create host.py using contract.md. ${condition}`
  writeFileSync(join(cwd, 'contract.md'), condition)
  const config = { cwd, requestText, targetPath: 'host.py', referencePaths: ['contract.md'], requiredCondition: condition,
    cases: [{ id: 'published-full-host', input: '{}', expectedJson: '{"tag":"runtime-host"}', exitCode: 0 }],
    isolated: { cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
      imageRef: 'python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7',
      imageId: 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7', workRoot: resolve(base, 'receipts') } }
  const producer = createConversationIsolatedPythonCheck(config)
  let preparations = 0, evaluations = 0
  const externalCodeCheck = { async prepare(material: Parameters<typeof producer.prepare>[0]) {
    preparations++
    const prepared = await producer.prepare(material)
    return prepared === undefined ? undefined : { ...prepared, async evaluate(candidate: Parameters<typeof prepared.evaluate>[0]) {
      evaluations++
      return prepared.evaluate(candidate)
    } }
  } }
  const admission = { kind: 'task', objective: 'Create the requested host CLI', criteria: [condition], family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null }
  const review = { verdict: 'met', category: null, explanation: 'The source is saved.', evidenceQuotes: ['saved'] }
  const script = [toolCallResponse('admit', 'structured_output', { decision: admission }),
    toolCallResponse('read-contract', 'read', { file_path: 'contract.md' }), toolCallResponse('read-absent', 'read', { file_path: 'host.py' }),
    toolCallResponse('write-host', 'write', { file_path: 'host.py', content: 'print(\'{"tag":"runtime-host"}\')' }),
    textResponse('saved'), auditedEvidenceResponse(review), auditedEvidenceResponse(review)]
  const services = ['tianwenConversationFileObserver', 'tianwenConversationObserver', 'tianwenConversationFeedback', 'tianwenConversationGuidanceLoop', 'tianwenMessageFeedbackBridge']
  async function mount(cold: boolean) {
    const harness = await mountFeedbackHarness(cwd, cold ? [] : script)
    try {
      await harness.ctx.plugin(localFs.default, { cwd })
      await harness.ctx.plugin(SubagentRuntime)
      await harness.ctx.plugin(spawn, { providerName: 'spawn' })
      await harness.ctx.plugin(fileTools, {})
      await applyBundle(harness.ctx, { stateRoot: join(cwd, 'state'), evolutionRoot: join(cwd, 'evolution'), captureExternalCodeArtifacts: true,
        externalCodeCheck, studyResultCheck: createConversationStudyIsolatedPythonCheck({ ...config, criteria: [condition] }) })
      for (let pass = 0; pass < 8; pass++) {
        await Promise.all([...harness.ctx.registry.values()].flatMap(runtime => [...runtime.fibers].map(fiber => fiber.await())))
        if (![...harness.ctx.registry.values()].some(runtime => [...runtime.fibers].some(fiber => fiber.inertia))) break
        if (pass === 7) throw new Error('Runtime lifecycle did not settle')
      }
      for (const name of services) expect(Boolean(harness.ctx.get(name)), name).toBe(true)
      expect(harness.ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined()).toBe(true)
      if (!cold) harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
      const handle = cold ? await harness.ctx.agents.resume({ resumeSessionId: SessionId('published-full-host'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
        : await harness.ctx.agents.create({ sessionId: SessionId('published-full-host'), meta: { cwd }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
      return { ...harness, handle }
    } catch (error) { await harness.ctx.fiber.dispose(); throw error }
  }
  let native: Awaited<ReturnType<typeof mount>> | undefined, cold: Awaited<ReturnType<typeof mount>> | undefined
  try {
    native = await mount(false)
    native.handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: requestText }] }))
    await native.handle.agent.whenIdle()
    await native.ctx.tianwenConversationObserver.whenIdle()
    const tasks = native.ctx.tianwenEvolution.listConversationTasks()
    expect(tasks).toHaveLength(1)
    const task = tasks[0]!
    expect(task.externalCheckFinished?.status).toBe('verified')
    expect(task.fileUnavailable).toBeUndefined()
    expect(task.review?.verdict).toBe('met')
    expect(preparations).toBe(1); expect(evaluations).toBe(1)
    expect(native.ctx.tianwenEvolution.listConversationGuidanceStudies()).toHaveLength(0)
    const ledger = readFileSync(join(cwd, 'evolution/ledger.jsonl'))
    await native.handle.dispose(); await native.ctx.fiber.dispose(); native = undefined
    cold = await mount(true)
    expect(cold.ctx.tianwenEvolution.listConversationTasks()).toEqual(tasks)
    expect(readFileSync(join(cwd, 'evolution/ledger.jsonl'))).toEqual(ledger)
    expect(cold.adapter.requests).toHaveLength(0)
    expect(preparations).toBe(1); expect(evaluations).toBe(1)
    expect(cold.ctx.tianwenEvolution.listConversationGuidanceStudies()).toHaveLength(0)
    // Keep each receipt immutable without making a successful rerun fail on
    // the previous receipt. The random owned cwd supplies this run's identity.
    writeFileSync(join(base, `${basename(cwd)}-result.json`), JSON.stringify({ controlled: true, realModelCalls: 0, naturalSources: 0,
      publishedPackageRoot: true, publishedRuntimeApply: true, services, activationQuarantine: true,
      preparations, evaluations, taskId: task.source.taskId, status: task.externalCheckFinished?.status,
      review: task.review?.verdict, studies: 0, coldRequests: 0, exactColdTask: true, exactColdLedger: true }, null, 2), { flag: 'wx' })
  } finally {
    if (cold) { await cold.handle.dispose(); await cold.ctx.fiber.dispose() }
    if (native) { await native.handle.dispose(); await native.ctx.fiber.dispose() }
    const resolved = realpathSync(cwd), ownedRoot = realpathSync(roots)
    if (!resolved.startsWith(ownedRoot + sep) || !resolved.startsWith('D:\\')) throw new Error('Temporary host directory ownership mismatch')
    rmSync(resolved, { recursive: true, force: true })
  }
}, 60_000)
