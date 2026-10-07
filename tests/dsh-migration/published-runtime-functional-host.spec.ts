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

for (const engine of ['python', 'node-project'] as const)
it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')(`uses published ${engine} factories in the full Runtime host and cold-recovers without preparing or executing again`, async () => {
  // Resolve the built public exports only on explicit opt-in. Default tests
  // must not require generated dist files. The root is not a package consumer;
  // use the package's own public self-reference rather than a new dependency.
  const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const { createConversationIsolatedPythonCheck, createConversationStudyIsolatedPythonCheck, createConversationIsolatedNodeProjectCheck, createConversationStudyIsolatedNodeProjectCheck } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle')).href)
  const { apply: applyBundle } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle/runtime')).href)
  const roots = resolve(base, 'test-roots')
  mkdirSync(roots, { recursive: true })
  const cwd = mkdtempSync(join(roots, 'host-'))
  const condition = engine === 'python' ? 'Return exactly JSON {"tag":"runtime-host"} with exit code zero and empty stderr.' : 'Preserve the captured Evolution core predicates: no-task admission unsupported, unconfigured task satisfied, and unconfigured rejection false; exit zero and empty stderr.'
  const requestText = engine === 'python' ? `Create host.py using contract.md. ${condition}` : `Implement conversation-external-check.ts and conversation-files.ts using the frozen learning-intake.ts and entry.mjs. ${condition}`
  const sourceRoot = resolve('packages/tianwen-evolution/src')
  const candidates = engine === 'python' ? [{ path: 'host.py', content: 'print(\'{"tag":"runtime-host"}\')' }] : ['conversation-external-check.ts', 'conversation-files.ts'].map(path => ({ path, content: readFileSync(join(sourceRoot, path), 'utf8') }))
  const references = engine === 'python' ? [{ path: 'contract.md', content: condition }] : [{ path: 'learning-intake.ts', content: readFileSync(join(sourceRoot, 'learning-intake.ts'), 'utf8') },
    { path: 'entry.mjs', content: `import {supportsConversationCodeCheck,hasSatisfiedConversationCodeCheck,hasRejectedConversationCodeCheck} from './conversation-external-check.js';console.log(JSON.stringify({supports:supportsConversationCodeCheck(undefined),satisfied:hasSatisfiedConversationCodeCheck({}),rejected:hasRejectedConversationCodeCheck({})}));` }]
  for (const reference of references) writeFileSync(join(cwd, reference.path), reference.content)
  const common = { cwd, requestText, referencePaths: references.map(file => file.path), requiredCondition: condition,
    cases: [{ id: 'published-full-host', input: '{}', expectedJson: engine === 'python' ? '{"tag":"runtime-host"}' : '{"supports":false,"satisfied":true,"rejected":false}', exitCode: 0 }],
    isolated: { cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
      imageRef: engine === 'python' ? 'python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7' : 'public.ecr.aws/docker/library/node@sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605',
      imageId: engine === 'python' ? 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7' : 'sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605', workRoot: resolve(base, 'receipts') } }
  const config = { ...common, targetPath: 'host.py' }, project = { ...common, entryPath: 'entry.mjs', outputPaths: candidates.map(file => file.path) }
  const producer = engine === 'python' ? createConversationIsolatedPythonCheck(config) : createConversationIsolatedNodeProjectCheck(project)
  let preparations = 0, evaluations = 0
  const externalCodeCheck = { async prepare(material: Parameters<typeof producer.prepare>[0]) {
    preparations++
    const prepared = await producer.prepare(material)
    return prepared === undefined ? undefined : { ...prepared, async evaluate(candidate: Parameters<typeof prepared.evaluate>[0]) {
      evaluations++
      return prepared.evaluate(candidate)
    } }
  } }
  const admission = { kind: 'task', objective: engine === 'python' ? 'Create the requested host CLI' : 'Implement the declared Evolution core modules', criteria: [condition], family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null }
  const review = { verdict: 'met', category: null, explanation: 'The source is saved.', evidenceQuotes: ['saved'] }
  // Ordinary native capture does not promise the host's declaration order.
  const captureCandidates = engine === 'node-project' ? [...candidates].reverse() : candidates
  const script = [toolCallResponse('admit', 'structured_output', { decision: admission }),
    ...references.filter(file => engine !== 'node-project' || file.path !== 'entry.mjs').map((file, index) => toolCallResponse(`read-reference-${index}`, 'read', { file_path: file.path })),
    ...captureCandidates.map((file, index) => toolCallResponse(`read-absent-${index}`, 'read', { file_path: file.path })),
    ...candidates.map((file, index) => toolCallResponse(`write-host-${index}`, 'write', { file_path: file.path, content: file.content })),
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
        externalCodeCheck, studyResultCheck: engine === 'python' ? createConversationStudyIsolatedPythonCheck({ ...config, criteria: [condition] }) : createConversationStudyIsolatedNodeProjectCheck({ ...project, criteria: [condition] }) })
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
    if (engine === 'node-project') {
      expect(task.completion?.files?.outputPaths).toEqual([...project.outputPaths].reverse())
      expect(task.fileInputs?.some(input => input.path === 'entry.mjs')).toBe(false)
      expect(task.externalCheckPrepared?.project?.inputs.some(input => input.path === 'entry.mjs')).toBe(true)
      expect(task.externalCheckFinished?.projectOutputs?.some(input => input.path === 'entry.mjs')).toBe(true)
    }
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
