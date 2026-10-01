import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse, type ScriptEntry } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { conversationQualityContract, sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'
import { recoverConversationTaskMaterial } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { recoverConversationCaseDesign } from '../../packages/tianwen-runtime-bundle/src/conversation-case-design.js'
import { createConversationStudyIsolatedPythonCohortCheck } from '../../scripts/conversation-isolated-python-check.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const fileToolsPath = cliRequire.resolve('@deepseek-ai/dsh-tool-fs')
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const presets = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-agent-presets')).href)
const base = 'D:/DevData/tianwen-functional-study-cohort-20261001'
const structured = (value: Record<string, unknown>) => toolCallResponse('structured', 'structured_output', value)
const user = (text: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const pair = (verdict: 'met' | 'not-met') => [1, 2].map(() => auditedEvidenceResponse({ verdict,
  category: verdict === 'met' ? null : 'instruction-following', explanation: 'Controlled functional requirement review.', evidenceQuotes: ['saved'] }))
const program = (n: number) => `print('{"n":${n}}')`

// Deliberate local host opt-in. Every model response is a scripted fixture; only Docker executes real code.
it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')('uses five different contracts before native design, runs ten real checks, and cold-recovers without preparing or executing again', async () => {
  mkdirSync(base + '/test-roots', { recursive: true }); const root = mkdtempSync(join(base, 'test-roots/native-cohort-'))
  const requiredCondition = 'Implement the stated JSON contract exactly, with zero exit code and empty stderr.'
  const qualityContract = conversationQualityContract()
  const independent = (i: number) => ({ prompt: `Implement task${i}.py following contract${i}.md.`, criteria: [`JSON n must equal ${i + 1}.`],
    files: { entries: [{ path: `task${i}.py`, content: null }, { path: `contract${i}.md`, content: `JSON n must equal ${i + 1}.` }], outputPaths: [`task${i}.py`] } })
  const script: ScriptEntry[] = []
  for (let i = 0; i < 3; i++) script.push(structured({ decision: { kind: 'task', objective: `Implement task${i}.py`, criteria: [`JSON n must equal ${i + 1}.`],
    family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null } }),
    toolCallResponse(`original-read-${i}`, 'read', { file_path: `contract${i}.md` }),
    toolCallResponse(`original-write-${i}`, 'write', { file_path: `task${i}.py`, content: program(i < 2 ? 99 : i + 1) }), textResponse('saved'), ...pair(i < 2 ? 'not-met' : 'met'))
  let preparations = 0, evaluations = 0, supplies = 0
  script.push(request => {
    expect(supplies).toBe(1); expect(preparations).toBe(5); expect(evaluations).toBe(0)
    const text = request.messages.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')
    expect(text).toContain('independentResultChecksDigest'); expect(text).toContain('task4.py')
    return structured({ adjacent: independent(3), holdout: independent(4) })
  }, structured({ guidance: 'Read the exact per-task JSON contract and implement its integer value without reusing another task value.' }))
  for (let i = 0; i < 5; i++) for (const arm of ['baseline', 'candidate'] as const) {
    const verdict = arm === 'baseline' && i < 2 ? 'not-met' : 'met'
    script.push(toolCallResponse(`trial-read-${i}-${arm}`, 'read', { file_path: `contract${i}.md` }),
      toolCallResponse(`trial-write-${i}-${arm}`, 'write', { file_path: `task${i}.py`, content: program(verdict === 'not-met' ? 99 : i + 1) }), textResponse('saved'), ...pair(verdict))
  }
  const harness = await mountPersistentHarness(join(root, 'sessions'), script)
  const presetRoot = join(root, 'presets'); mkdirSync(join(presetRoot, 'files'), { recursive: true })
  writeFileSync(join(presetRoot, 'files/agent.cordis.yml'), `- id: file-tools\n  name: '${fileToolsPath}'\n  config: {}\n`)
  await harness.ctx.plugin(localFs.default, { cwd: root }); await harness.ctx.plugin(Loader)
  await harness.ctx.plugin(presets.default, { default: 'files', roots: [{ path: presetRoot, trust: 'system' }], includeUserRoot: false })
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' }); await applyRuntime(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await harness.ctx.plugin(TianwenConversationFileObserverService, { externalCodeArtifacts: true })
  await harness.ctx.plugin(TianwenConversationObserverService)
  const presetRegistry = harness.ctx as typeof harness.ctx & { agentPresets: { mount(ctx: typeof harness.ctx, name: string): Promise<unknown> } }
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('cohort-native'), meta: { cwd: root, agentPreset: 'files' },
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' }, setup: async ctx => { await presetRegistry.agentPresets.mount(ctx, 'files') } })
  try {
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(root, `contract${i}.md`), `JSON n must equal ${i + 1}.`)
      handle.agent.followup(user(`Implement task${i}.py following contract${i}.md.`))
      await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    }
    const tasks = harness.ctx.tianwenEvolution.listConversationTasks(), materials = await Promise.all(tasks.map(task => recoverConversationTaskMaterial(harness.ctx, task)))
    expect(tasks.map(task => task.review?.verdict)).toEqual(['not-met', 'not-met', 'met'])
    const modelConfigDigest = tasks[0]!.models![0]!.modelConfigDigest
    const isolated = { cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
      imageRef: 'python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7',
      imageId: 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7', workRoot: base + '/native-receipts' }
    const ids = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
    const definitions = Object.fromEntries(ids.map((id, i) => {
      const task = independent(i), material = i < 3 ? materials[i]! : { prompt: task.prompt, criteria: task.criteria, qualityContract,
        files: { schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'files' as const, cwd: root, ...task.files } }
      return [id, { material, requiredCondition, isolated, cases: [{ id: `exact-json-${i}`, input: '{}', expectedJson: `{"n":${i + 1}}`, exitCode: 0 }] }]
    })) as unknown as Parameters<typeof createConversationStudyIsolatedPythonCohortCheck>[0]['cases']
    const cohort = createConversationStudyIsolatedPythonCohortCheck({ modelConfigDigest, cases: definitions })
    const beforeStudy = harness.adapter.requests.length
    const producer = { async prepareIndependentCases(material: Parameters<NonNullable<typeof cohort.prepareIndependentCases>>[0]) {
      supplies++; expect(harness.adapter.requests).toHaveLength(beforeStudy); return cohort.prepareIndependentCases!(material)
    }, async prepare(material: Parameters<typeof cohort.prepare>[0]) {
      preparations++; expect(harness.adapter.requests).toHaveLength(beforeStudy); const prepared = await cohort.prepare(material)
      return prepared === undefined ? undefined : { ...prepared, async evaluate(candidate: Parameters<typeof prepared.evaluate>[0]) {
        evaluations++; expect(preparations).toBe(5); return prepared.evaluate(candidate)
      } }
    } }
    await harness.ctx.plugin(TianwenConversationGuidanceLoopService, { evolutionRoot: join(root, 'evolution'), guidanceActivationQuarantine: true, studyResultCheck: producer })
    await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    const studies = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()
    expect(studies).toHaveLength(1); const study = studies[0]!
    expect(study.decision?.verdict).toBe('accepted'); expect(study.activation).toBeUndefined()
    expect(study.opened.resultChecks).toHaveLength(5); expect(study.fileTrials).toHaveLength(10)
    expect(study.arms.map(arm => arm.resultCheck?.status)).toEqual(['rejected', 'verified', 'rejected', 'verified', 'verified', 'verified', 'verified', 'verified', 'verified', 'verified'])
    expect(preparations).toBe(5); expect(evaluations).toBe(10)
    const recovered = await recoverConversationCaseDesign(harness.ctx, study.opened)
    const ledger = readFileSync(join(root, 'evolution/ledger.jsonl'))
    await handle.dispose(); await harness.ctx.fiber.dispose()
    const cold = await mountPersistentHarness(join(root, 'sessions'), [])
    try {
      await applyRuntime(cold.ctx, { evolutionRoot: join(root, 'evolution') })
      expect(cold.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]).toEqual(study)
      expect(await recoverConversationCaseDesign(cold.ctx, study.opened)).toEqual(recovered)
      expect(cold.adapter.requests).toHaveLength(0); expect(readFileSync(join(root, 'evolution/ledger.jsonl'))).toEqual(ledger)
      expect(preparations).toBe(5); expect(evaluations).toBe(10)
      writeFileSync(base + '/native-cohort-control.json', JSON.stringify({ controlled: true, naturalSources: 0, realProviderRequests: 0,
        supplies, preparations, evaluations, contracts: study.opened.resultChecks, studyId: study.opened.studyId, verdict: study.decision?.verdict,
        activated: false, coldRequests: 0, exactCaseMaterial: true, ledgerUnchanged: true }), { flag: 'wx' })
    } finally { await cold.ctx.fiber.dispose() }
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose(); rmSync(root, { recursive: true, force: true }) }
}, 120_000)
