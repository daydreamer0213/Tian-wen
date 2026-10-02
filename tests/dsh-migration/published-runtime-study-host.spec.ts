import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { CallId, SessionId, createUserMessage, mountFeedbackHarness, textResponse, toolCallResponse, type ScriptEntry } from '@tianwen/dsh-compat'
import type { ConversationExternalCodeCheck, ConversationStudyResultCheck } from '../../packages/tianwen-runtime-bundle/src/index.js'
import type { TianwenRuntimeBundleConfig } from '../../packages/tianwen-runtime-bundle/src/runtime.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const presets = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-agent-presets')).href)
const fileToolsPath = cliRequire.resolve('@deepseek-ai/dsh-tool-fs')
const base = process.env.TIANWEN_PUBLISHED_STUDY_ROOT ?? 'D:/DevData/tianwen-published-study-host-20261002'
const user = (text: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const structured = (value: Record<string, unknown>) => toolCallResponse('structured', 'structured_output', value)
const reviews = (verdict: 'met' | 'not-met') => [1, 2].map(() => auditedEvidenceResponse({ verdict,
  category: verdict === 'met' ? null : 'instruction-following', explanation: 'Explicit scripted fixture, not a real model verdict.', evidenceQuotes: ['saved'] }))

for (const scenario of ['accepted-quarantined', 'failed-holdout-blocked'] as const)
it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')(`automatically adjudicates a published Runtime study: ${scenario}`, async () => {
  const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const { createConversationIsolatedPythonCheck, createConversationStudyIsolatedPythonCohortCheck } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle')).href)
  const { apply: applyBundle } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle/runtime')).href)
  const roots = resolve(base, 'test-roots'); mkdirSync(roots, { recursive: true })
  const root = mkdtempSync(join(roots, 'study-'))
  const values = [307, 311, 313, 317, 331] as const
  const roles = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
  const condition = 'Return the JSON object specified in the original contract, with exit code zero and empty stderr.'
  const prompt = (index: number) => `Implement task${index}.py using contract${index}.md. ${condition}`
  const reference = (index: number) => `Return exactly {"n":${values[index]}}. ${condition}`
  const program = (n: number) => `print('{"n":${n}}')`
  const independent = (index: number) => ({ prompt: prompt(index), criteria: [condition], files: {
    entries: [{ path: `task${index}.py`, content: null }, { path: `contract${index}.md`, content: reference(index) }], outputPaths: [`task${index}.py`] } })
  const isolated = { cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
    imageRef: 'python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7',
    imageId: 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7', workRoot: resolve(base, 'receipts') }
  const functionalCases = (index: number) => [{ id: `host-contract-${index}`, input: '{}', expectedJson: `{"n":${values[index]}}`, exitCode: 0 }]
  const ordinary = values.slice(0, 3).map((_value, index) => createConversationIsolatedPythonCheck({ cwd: root, requestText: prompt(index),
    targetPath: `task${index}.py`, referencePaths: [`contract${index}.md`], requiredCondition: condition, cases: functionalCases(index), isolated }))
  let ordinaryPrepared = 0, ordinaryEvaluated = 0, supplied = 0, prepared = 0, evaluated = 0
  const externalCodeCheck: ConversationExternalCodeCheck = { async prepare(material) {
    const text = material.request.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')
    const index = [0, 1, 2].find(index => text === prompt(index))
    if (index === undefined) return undefined
    ordinaryPrepared++
    const check = await ordinary[index]!.prepare(material)
    return check === undefined ? undefined : { ...check, async evaluate(candidate) { ordinaryEvaluated++; return check.evaluate(candidate) } }
  } }
  let cohort: ConversationStudyResultCheck | undefined
  const studyResultCheck: ConversationStudyResultCheck = { async prepareIndependentCases(material) {
    expect(supplied).toBe(0); supplied++
    expect(ordinaryPrepared).toBe(3); expect(ordinaryEvaluated).toBe(3)
    const originals = [...material.sources, material.counterexample]
    for (const [index, original] of originals.entries()) {
      expect(original.criteria).toEqual([condition])
      expect(original.files?.entries.find(entry => entry.path === `contract${index}.md`)?.content).toBe(reference(index))
      expect(original.files?.outputPaths).toEqual([`task${index}.py`])
    }
    const definitions = Object.fromEntries(roles.map((role, index) => [role, {
      material: index < 3 ? originals[index] : { ...independent(index), files: { schemaVersion: 'tianwen.conversation-file-material.v1',
        outputKind: 'files', cwd: root, ...independent(index).files }, qualityContract: material.qualityContract },
      requiredCondition: condition, cases: functionalCases(index), isolated,
    }]))
    cohort = createConversationStudyIsolatedPythonCohortCheck({ modelConfigDigest: material.modelConfigDigest, cases: definitions })
    return cohort!.prepareIndependentCases!(material)
  }, async prepare(material) {
    if (!cohort) return undefined
    prepared++
    const check = await cohort.prepare(material)
    return check === undefined ? undefined : { ...check, async evaluate(candidate) { evaluated++; expect(prepared).toBe(5); return check.evaluate(candidate) } }
  } }
  const script: ScriptEntry[] = []
  for (let index = 0; index < 3; index++) script.push(structured({ decision: { kind: 'task', objective: `Implement task${index}.py`, criteria: [condition],
    family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null } }),
    toolCallResponse(`read-${index}`, 'read', { file_path: `contract${index}.md` }), toolCallResponse(`read-absent-${index}`, 'read', { file_path: `task${index}.py` }),
    toolCallResponse(`write-${index}`, 'write', { file_path: `task${index}.py`, content: program(index < 2 ? 997 : values[index]!) }), textResponse('saved'), ...reviews('met'))
  script.push(request => {
    expect(supplied).toBe(1); expect(prepared).toBe(5); expect(evaluated).toBe(0)
    const text = request.messages.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')
    expect(text).toContain('independentResultChecksDigest')
    return structured({ adjacent: independent(3), holdout: independent(4) })
  }, structured({ guidance: 'Read the original per-task JSON contract, implement that value and check the result rather than copying another task value.' }))
  for (let index = 0; index < 5; index++) for (const arm of ['baseline', 'candidate'] as const) {
    const baselineFailure = arm === 'baseline' && index < 2
    const holdoutFailure = scenario === 'failed-holdout-blocked' && arm === 'candidate' && index === 4
    script.push(toolCallResponse(`trial-read-${index}-${arm}`, 'read', { file_path: `contract${index}.md` }),
      toolCallResponse(`trial-write-${index}-${arm}`, 'write', { file_path: `task${index}.py`, content: program(baselineFailure || holdoutFailure ? 997 : values[index]!) }),
      textResponse('saved'), ...reviews(baselineFailure ? 'not-met' : 'met'))
  }
  const presetRoot = join(root, 'presets'); mkdirSync(join(presetRoot, 'files'), { recursive: true })
  writeFileSync(join(presetRoot, 'files/agent.cordis.yml'), `- id: file-tools\n  name: '${fileToolsPath}'\n  config: {}\n`)
  const services = ['tianwenConversationFileObserver', 'tianwenConversationObserver', 'tianwenConversationFeedback', 'tianwenConversationGuidanceLoop', 'tianwenMessageFeedbackBridge']
  async function mount(cold: boolean) {
    const harness = await mountFeedbackHarness(root, cold ? [] : script)
    try {
      await harness.ctx.plugin(localFs.default, { cwd: root }); await harness.ctx.plugin(Loader)
      await harness.ctx.plugin(presets.default, { default: 'files', roots: [{ path: presetRoot, trust: 'system' }], includeUserRoot: false })
      await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
      const bundleConfig: TianwenRuntimeBundleConfig = { stateRoot: join(root, 'state'), evolutionRoot: join(root, 'evolution'), captureExternalCodeArtifacts: true,
        externalCodeCheck, studyResultCheck }
      await applyBundle(harness.ctx, bundleConfig)
      for (let pass = 0; pass < 8; pass++) {
        await Promise.all([...harness.ctx.registry.values()].flatMap(runtime => [...runtime.fibers].map(fiber => fiber.await())))
        if (![...harness.ctx.registry.values()].some(runtime => [...runtime.fibers].some(fiber => fiber.inertia))) break
        if (pass === 7) throw new Error('Runtime lifecycle did not settle')
      }
      for (const name of services) expect(Boolean(harness.ctx.get(name)), name).toBe(true)
      expect(harness.ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined()).toBe(true)
      if (!cold) harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
      return harness
    } catch (error) { await harness.ctx.fiber.dispose(); throw error }
  }
  type HostContext = Awaited<ReturnType<typeof mount>>['ctx']
  let harness: Awaited<ReturnType<typeof mount>> | undefined, cold: Awaited<ReturnType<typeof mount>> | undefined
  let handle: Awaited<ReturnType<Awaited<ReturnType<typeof mount>>['ctx']['agents']['create']>> | undefined
  try {
    harness = await mount(false)
    const registry = harness.ctx as HostContext & { agentPresets: { mount(ctx: HostContext, name: string): Promise<unknown> } }
    handle = await harness.ctx.agents.create({ sessionId: SessionId('published-study'), meta: { cwd: root, agentPreset: 'files' },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' }, setup: async ctx => { await registry.agentPresets.mount(ctx, 'files') } })
    for (let index = 0; index < 3; index++) {
      writeFileSync(join(root, `contract${index}.md`), reference(index))
      handle.agent.followup(user(prompt(index)))
      await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle(); await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    }
    const tasks = harness.ctx.tianwenEvolution.listConversationTasks(), studies = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()
    expect(tasks).toHaveLength(3); expect(tasks.map(task => task.review?.verdict)).toEqual(['met', 'met', 'met'])
    expect(tasks.map(task => task.externalCheckFinished?.status)).toEqual(['rejected', 'rejected', 'verified'])
    expect(studies).toHaveLength(1); const study = studies[0]!
    // The original decision is the model verdict. Independent results gate
    // adoption separately; keep that established meaning and historical replay.
    expect(study.decision?.verdict).toBe('accepted')
    expect(study.activation).toBeUndefined(); expect(study.opened.checkedFailureSources).toHaveLength(2)
    expect(study.opened.resultChecks).toHaveLength(5); expect(study.arms).toHaveLength(10)
    expect(study.arms.map(arm => arm.resultCheck?.status)).toEqual(['rejected', 'verified', 'rejected', 'verified', 'verified', 'verified', 'verified', 'verified', 'verified', scenario === 'accepted-quarantined' ? 'verified' : 'rejected'])
    const holdout = study.arms.find(arm => arm.caseId === 'holdout' && arm.role === 'candidate')!
    expect(holdout.verdict).toBe('met'); expect(holdout.reviewChecks!.map(check => check.verdict)).toEqual(['met', 'met'])
    expect(supplied).toBe(1); expect(prepared).toBe(5); expect(evaluated).toBe(10)
    const ledger = readFileSync(join(root, 'evolution/ledger.jsonl'))
    const requestCount = harness.adapter.requests.length
    const status = await harness.ctx.tools.execute({ callId: CallId(`study-status-${basename(root)}`), name: 'tianwen_learning_status',
      arguments: {}, agent: handle.agent, signal: new AbortController().signal })
    expect(status).toMatchObject({ isError: false, value: { currentSession: { naturalConversation: { guidanceStudies: {
      total: 1, accepted: 1, currentlyActive: 0,
      independentResults: { configuredStudies: 1, recordedArms: 10, pendingArms: 0,
        verified: scenario === 'accepted-quarantined' ? 8 : 7, rejected: scenario === 'accepted-quarantined' ? 2 : 3,
        satisfiedStudies: scenario === 'accepted-quarantined' ? 1 : 0 },
      activationPending: { total: 1, quarantined: 1, independentResultsNotSatisfied: scenario === 'accepted-quarantined' ? 0 : 1 },
    } } } } })
    expect(readFileSync(join(root, 'evolution/ledger.jsonl'))).toEqual(ledger)
    expect(harness.adapter.requests).toHaveLength(requestCount)
    await handle.dispose(); handle = undefined; await harness.ctx.fiber.dispose(); harness = undefined
    cold = await mount(true)
    await cold.ctx.tianwenConversationObserver.whenIdle(); await cold.ctx.tianwenConversationGuidanceLoop.whenIdle()
    expect(cold.ctx.tianwenEvolution.listConversationTasks()).toEqual(tasks)
    expect(cold.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual(studies)
    expect(readFileSync(join(root, 'evolution/ledger.jsonl'))).toEqual(ledger); expect(cold.adapter.requests).toHaveLength(0)
    expect(ordinaryPrepared).toBe(3); expect(ordinaryEvaluated).toBe(3); expect(supplied).toBe(1); expect(prepared).toBe(5); expect(evaluated).toBe(10)
    writeFileSync(join(base, `${basename(root)}-${scenario}.json`), JSON.stringify({ scenario, controlled: true, realModelRequests: 0, naturalSources: 0,
      publishedRuntime: true, services, ordinaryPrepared, ordinaryEvaluated, originalReviews: tasks.map(task => task.review?.verdict),
      originalResults: tasks.map(task => task.externalCheckFinished?.status), supplied, prepared, evaluated,
      studyId: study.opened.studyId, resultChecks: study.opened.resultChecks, decision: study.decision?.verdict,
      holdoutReview: holdout.verdict, holdoutResult: holdout.resultCheck?.status, activated: false,
      independentResultsSatisfied: scenario === 'accepted-quarantined', statusProjectionVerified: true,
      exactColdTasks: true, exactColdStudy: true, exactColdLedger: true, coldRequests: 0 }, null, 2), { flag: 'wx' })
  } finally {
    if (handle) await handle.dispose()
    if (harness) await harness.ctx.fiber.dispose()
    if (cold) await cold.ctx.fiber.dispose()
    const realRoot = realpathSync(root), realParent = realpathSync(roots)
    if (!realRoot.startsWith(realParent + sep) || !realRoot.startsWith('D:\\')) throw new Error('Temporary study ownership mismatch')
    rmSync(realRoot, { recursive: true, force: true })
  }
}, 120_000)
