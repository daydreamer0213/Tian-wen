import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, createUserMessage, mountFeedbackHarness, textResponse, toolCallResponse, type ScriptEntry } from '@tianwen/dsh-compat'
import { apply as applyCore } from '../../packages/tianwen-runtime/dist/index.js'
import type {} from '../../packages/tianwen-evidence/dist/index.js'
import { guidanceVersion } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'
import { TianwenConversationFeedbackService } from '../../packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.js'
import { TianwenMessageFeedbackBridgeService } from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'
import type { ConversationExternalCodeCheck, ConversationStudyResultCheck } from '../../packages/tianwen-runtime-bundle/src/index.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const presets = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-agent-presets')).href)
const fileToolsPath = cliRequire.resolve('@deepseek-ai/dsh-tool-fs')
const base = process.env.TIANWEN_METHOD_LIFECYCLE_ROOT ?? 'D:/DevData/tianwen-native-method-lifecycle-20261003'
const user = (text: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const structured = (value: Record<string, unknown>) => toolCallResponse('structured', 'structured_output', value)
const reviews = (verdict: 'met' | 'not-met') => [1, 2].map(() => auditedEvidenceResponse({ verdict,
  category: verdict === 'met' ? null : 'instruction-following', explanation: 'Scripted lifecycle mechanism fixture, not a real model judgment.', evidenceQuotes: ['saved'] }))

// The formal published /runtime remains quarantined. This is the existing
// controlled host composition, not a permission to enable formal learning.
it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')('uses an automatically adopted method in new native tasks and rolls back independent regressions despite met model reviews', async () => {
  const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const { createConversationIsolatedPythonCheck, createConversationStudyIsolatedPythonCohortCheck } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle')).href)
  const roots = resolve(base, 'test-roots'); mkdirSync(roots, { recursive: true })
  const root = mkdtempSync(join(roots, 'lifecycle-'))
  const values = [601, 607, 613, 617, 619, 631, 641, 643, 647] as const
  const roles = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
  const condition = 'Return the exact JSON object required by the original contract, with exit code zero and empty stderr.'
  const method = 'Read each original JSON contract and preserve its required value in the program; check that program instead of copying a value from another task.'
  const prompt = (index: number) => `Implement task${index}.py using contract${index}.md. ${condition}`
  const reference = (index: number) => `Return exactly {"n":${values[index]}}. ${condition}`
  const program = (n: number) => `print('{"n":${n}}')`
  const independent = (index: number) => ({ prompt: prompt(index), criteria: [condition], files: {
    entries: [{ path: `task${index}.py`, content: null }, { path: `contract${index}.md`, content: reference(index) }], outputPaths: [`task${index}.py`] } })
  const isolated = { cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
    imageRef: 'python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7',
    imageId: 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7', workRoot: resolve(base, 'receipts') }
  const cases = (index: number) => [{ id: `lifecycle-contract-${index}`, input: '{}', expectedJson: `{"n":${values[index]}}`, exitCode: 0 }]
  const taskIndexes = [0, 1, 2, 5, 6, 7, 8]
  const ordinary = new Map(taskIndexes.map(index => [index, createConversationIsolatedPythonCheck({ cwd: root, requestText: prompt(index),
    targetPath: `task${index}.py`, referencePaths: [`contract${index}.md`], requiredCondition: condition, cases: cases(index), isolated })]))
  let ordinaryPrepared = 0, ordinaryEvaluated = 0, supplied = 0, prepared = 0, evaluated = 0
  const externalCodeCheck: ConversationExternalCodeCheck = { async prepare(material) {
    const text = material.request.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')
    const index = taskIndexes.find(index => text === prompt(index))
    if (index === undefined) return undefined
    ordinaryPrepared++
    const check = await ordinary.get(index)!.prepare(material)
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
    }
    const definitions = Object.fromEntries(roles.map((role, index) => [role, {
      material: index < 3 ? originals[index] : { ...independent(index), files: { schemaVersion: 'tianwen.conversation-file-material.v1',
        outputKind: 'files', cwd: root, ...independent(index).files }, qualityContract: material.qualityContract },
      requiredCondition: condition, cases: cases(index), isolated,
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
  const admission = (index: number) => structured({ decision: { kind: 'task', objective: `Implement task${index}.py`, criteria: [condition],
    family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null } })
  for (let index = 0; index < 3; index++) script.push(admission(index),
    toolCallResponse(`read-${index}`, 'read', { file_path: `contract${index}.md` }), toolCallResponse(`absent-${index}`, 'read', { file_path: `task${index}.py` }),
    toolCallResponse(`write-${index}`, 'write', { file_path: `task${index}.py`, content: program(index < 2 ? 991 : values[index]!) }), textResponse('saved'), ...reviews('met'))
  script.push(request => {
    expect(supplied).toBe(1); expect(prepared).toBe(5); expect(evaluated).toBe(0)
    expect(JSON.stringify(request.messages)).toContain('independentResultChecksDigest')
    return structured({ adjacent: independent(3), holdout: independent(4) })
  }, structured({ guidance: method }))
  for (let index = 0; index < 5; index++) for (const arm of ['baseline', 'candidate'] as const) {
    const failure = arm === 'baseline' && index < 2
    script.push(toolCallResponse(`trial-read-${index}-${arm}`, 'read', { file_path: `contract${index}.md` }),
      toolCallResponse(`trial-write-${index}-${arm}`, 'write', { file_path: `task${index}.py`, content: program(failure ? 991 : values[index]!) }),
      textResponse('saved'), ...reviews(failure ? 'not-met' : 'met'))
  }
  let nativeMethodRequests = 0, nativeWithdrawalRequests = 0
  for (const index of [5, 6, 7, 8]) script.push(admission(index), request => {
    const reminder = request.messages.filter(message => 'source' in message && message.source.kind === 'plugin'
      && message.source.plugin === 'tianwen-conversation-guidance').at(-1)
    expect(reminder).toBeDefined()
    const text = reminder!.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    if (index === 8) {
      expect(text).toContain('Earlier Tianwen task guidance no longer applies')
      expect(text).toContain('current evaluated method is none.')
      expect(text).not.toContain(method); nativeWithdrawalRequests++
    } else { expect(text).toContain(method); nativeMethodRequests++ }
    return toolCallResponse(`future-read-${index}`, 'read', { file_path: `contract${index}.md` })
  }, toolCallResponse(`future-absent-${index}`, 'read', { file_path: `task${index}.py` }),
    toolCallResponse(`future-write-${index}`, 'write', { file_path: `task${index}.py`, content: program(index === 6 || index === 7 ? 991 : values[index]!) }),
    textResponse('saved'), ...reviews('met'))
  const presetRoot = join(root, 'presets'); mkdirSync(join(presetRoot, 'files'), { recursive: true })
  writeFileSync(join(presetRoot, 'files/agent.cordis.yml'), `- id: file-tools\n  name: '${fileToolsPath}'\n  config: {}\n`)
  async function mount(cold: boolean) {
    const harness = await mountFeedbackHarness(root, cold ? [] : script)
    try {
      await harness.ctx.plugin(localFs.default, { cwd: root }); await harness.ctx.plugin(Loader)
      await harness.ctx.plugin(presets.default, { default: 'files', roots: [{ path: presetRoot, trust: 'system' }], includeUserRoot: false })
      await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
      await applyCore(harness.ctx, { evolutionRoot: join(root, 'evolution') })
      await harness.ctx.plugin(TianwenConversationFileObserverService, { externalCodeArtifacts: true })
      await harness.ctx.plugin(TianwenConversationObserverService, { externalCodeCheck })
      await harness.ctx.plugin(TianwenMessageFeedbackBridgeService); await harness.ctx.plugin(TianwenConversationFeedbackService)
      await harness.ctx.plugin(TianwenConversationGuidanceLoopService, { evolutionRoot: join(root, 'evolution'), studyResultCheck })
      expect(harness.ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined()).toBe(false)
      if (!cold) harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
      return harness
    } catch (error) { await harness.ctx.fiber.dispose(); throw error }
  }
  type HostContext = Awaited<ReturnType<typeof mount>>['ctx']
  let harness: Awaited<ReturnType<typeof mount>> | undefined, cold: Awaited<ReturnType<typeof mount>> | undefined
  let handle: Awaited<ReturnType<HostContext['agents']['create']>> | undefined
  try {
    harness = await mount(false)
    const registry = harness.ctx as HostContext & { agentPresets: { mount(ctx: HostContext, name: string): Promise<unknown> } }
    handle = await harness.ctx.agents.create({ sessionId: SessionId('controlled-method-lifecycle'), meta: { cwd: root, agentPreset: 'files' },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' }, setup: async ctx => { await registry.agentPresets.mount(ctx, 'files') } })
    async function task(index: number) {
      writeFileSync(join(root, `contract${index}.md`), reference(index))
      handle!.agent.followup(user(prompt(index)))
      await handle!.agent.whenIdle(); await harness!.ctx.tianwenConversationObserver.whenIdle(); await harness!.ctx.tianwenConversationGuidanceLoop.whenIdle()
    }
    for (let index = 0; index < 3; index++) await task(index)
    const studies = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()
    expect(studies).toHaveLength(1); const initial = studies[0]!
    expect(initial.decision?.verdict).toBe('accepted'); expect(initial.activation?.kind).toBe('guidance-activated')
    expect(initial.rollback).toBeUndefined(); expect(initial.opened.resultChecks).toHaveLength(5); expect(initial.arms).toHaveLength(10)
    const activeVersion = guidanceVersion(initial.candidate!.candidateSnapshot), parentVersion = initial.opened.parentVersion
    expect(guidanceVersion(harness.ctx.tianwenEvolution.getConversationGuidance(initial.opened.scopeKey))).toBe(activeVersion)
    await task(5)
    expect(harness.ctx.tianwenEvolution.listConversationTasks().at(-1)).toMatchObject({ source: { behaviorVersion: activeVersion }, externalCheckFinished: { status: 'verified' } })
    await task(6)
    expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.rollback).toBeUndefined()
    expect(guidanceVersion(harness.ctx.tianwenEvolution.getConversationGuidance(initial.opened.scopeKey))).toBe(activeVersion)
    await task(7)
    const rolled = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!
    const tasksBeforeWithdrawal = harness.ctx.tianwenEvolution.listConversationTasks()
    const regressions = tasksBeforeWithdrawal.slice(-2)
    expect(regressions.map(task => task.review?.verdict)).toEqual(['met', 'met'])
    expect(regressions.map(task => task.externalCheckFinished?.status)).toEqual(['rejected', 'rejected'])
    expect(regressions.every(task => task.source.behaviorVersion === activeVersion)).toBe(true)
    expect(rolled.rollback).toMatchObject({ reason: 'regression', evidenceFailurePolicy: 'model-or-code-check.v1',
      evidenceTaskIds: regressions.map(task => task.source.taskId) })
    expect(guidanceVersion(harness.ctx.tianwenEvolution.getConversationGuidance(initial.opened.scopeKey))).toBe(parentVersion)
    await task(8)
    const tasks = harness.ctx.tianwenEvolution.listConversationTasks(), finalStudies = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()
    expect(tasks).toHaveLength(7); expect(finalStudies).toHaveLength(1)
    expect(tasks.map(task => task.review?.verdict)).toEqual(Array(7).fill('met'))
    expect(tasks.map(task => task.externalCheckFinished?.status)).toEqual(['rejected', 'rejected', 'verified', 'verified', 'rejected', 'rejected', 'verified'])
    expect(tasks.at(-1)!.source.behaviorVersion).toBe(parentVersion)
    expect(nativeMethodRequests).toBe(3); expect(nativeWithdrawalRequests).toBe(1)
    expect(ordinaryPrepared).toBe(7); expect(ordinaryEvaluated).toBe(7); expect(supplied).toBe(1); expect(prepared).toBe(5); expect(evaluated).toBe(10)
    const ledger = readFileSync(join(root, 'evolution/ledger.jsonl'))
    await handle.dispose(); handle = undefined; await harness.ctx.fiber.dispose(); harness = undefined
    cold = await mount(true)
    await cold.ctx.tianwenConversationObserver.whenIdle(); await cold.ctx.tianwenConversationGuidanceLoop.whenIdle()
    expect(cold.ctx.tianwenEvolution.listConversationTasks()).toEqual(tasks)
    expect(cold.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual(finalStudies)
    expect(readFileSync(join(root, 'evolution/ledger.jsonl'))).toEqual(ledger); expect(cold.adapter.requests).toHaveLength(0)
    expect(ordinaryPrepared).toBe(7); expect(ordinaryEvaluated).toBe(7); expect(supplied).toBe(1); expect(prepared).toBe(5); expect(evaluated).toBe(10)
    writeFileSync(join(base, `${basename(root)}-result.json`), JSON.stringify({ controlled: true, realModelRequests: 0, naturalSources: 0,
      formalRuntime: false, publishedFactories: true, ordinaryPrepared, ordinaryEvaluated, supplied, prepared, evaluated,
      taskReviews: tasks.map(task => task.review?.verdict), taskResults: tasks.map(task => task.externalCheckFinished?.status),
      studyId: initial.opened.studyId, decision: initial.decision?.verdict, activation: initial.activation, rollback: rolled.rollback,
      activeVersion, parentVersion, nativeMethodRequests, nativeWithdrawalRequests, exactColdTasks: true, exactColdStudy: true,
      exactColdLedger: true, coldRequests: 0, effectiveTaskBehaviorVersions: tasks.map(task => task.source.behaviorVersion) }, null, 2), { flag: 'wx' })
  } finally {
    if (handle) await handle.dispose()
    if (harness) await harness.ctx.fiber.dispose()
    if (cold) await cold.ctx.fiber.dispose()
    const realRoot = realpathSync(root), realParent = realpathSync(roots)
    if (!realRoot.startsWith(realParent + sep) || !realRoot.startsWith('D:\\')) throw new Error('Temporary lifecycle ownership mismatch')
    rmSync(realRoot, { recursive: true, force: true })
  }
}, 180_000)
