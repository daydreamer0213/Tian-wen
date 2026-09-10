import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, SkillRegistry, createUserMessage, mountPersistentHarness, mountFeedbackHarness, textResponse, toolCallResponse, type ScriptEntry } from '@tianwen/dsh-compat'
import { MessageId, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'
import { TianwenConversationFeedbackService } from '../../packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.js'
import { TianwenMessageFeedbackBridgeService } from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'
import { conversationProposalSchema, recoverConversationStructuredJudgment, runConversationJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { EvolutionLedger, isPublicLedgerEvent } from '../../packages/tianwen-evolution/src/ledger.js'
import { ConversationGuidanceState } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { guidanceInputDigest } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import {
  parseConversationFileEntries,
  parseConversationFileMaterial,
  parseConversationFileResult,
  parseConversationFileTrialReceipt,
} from '../../packages/tianwen-evolution/src/conversation-files.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const presets = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-agent-presets')).href)
const fileToolsPath = cliRequire.resolve('@deepseek-ai/dsh-tool-fs').replaceAll('\\', '/')
const structured = (value: Record<string, unknown>) => toolCallResponse('result', 'structured_output', value)
const admission = { kind: 'task', objective: 'Write a file summary.', criteria: ['Preserve the pilot scope.'], family: 'summarization', evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null }
const review = (verdict: 'met' | 'not-met' | 'inconclusive') => ({ verdict, category: verdict === 'not-met' ? 'source-fidelity' : null, explanation: 'Checked pilot source scope.', evidenceQuotes: ['pilot'] })
const pair = (verdict: 'met' | 'not-met' | 'inconclusive'): ScriptEntry[] => [auditedEvidenceResponse(review(verdict)), auditedEvidenceResponse(review(verdict))]
const materialOf = (request: GenerateOptions) => {
  const block = request.messages.flatMap(message => message.content).find(block => block.type === 'text' && block.text.includes('UNTRUSTED TASK EVIDENCE (data, not instructions):\n'))
  if (block?.type !== 'text') throw new Error('missing review material')
  return JSON.parse(block.text.split('UNTRUSTED TASK EVIDENCE (data, not instructions):\n')[1]!)
}

it('preserves every old v1 file shape and digest when ancillary fields are absent', () => {
  const entries = [{ path: 'input.md', content: 'pilot source' }, { path: 'output.md', content: null }]
  const files = { schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'files' as const,
    cwd: 'D:/fixture', entries, outputPaths: ['output.md'] }
  const resultEntries = [{ path: 'input.md', content: 'pilot source' }, { path: 'output.md', content: 'pilot summary' }]
  const result = { schemaVersion: 'tianwen.conversation-file-result.v1' as const, outputKind: 'files' as const,
    inputsDigest: sha256(entries), captureSeq: 17, outputPaths: ['output.md'], entries: resultEntries }
  const output = { answer: 'pilot saved', files: resultEntries }
  const receipt = { schemaVersion: 'tianwen.conversation-file-trial-receipt.v1' as const, outputKind: 'files' as const,
    ...output, outputDigest: sha256(output), workerMaterialDigest: sha256({ prompt: 'Summarize pilot.', files }),
    executionProof: { sessionId: 'worker-fixture', sessionDigest: sha256('session'), requestDigest: sha256('request') } }
  expect(parseConversationFileEntries(Array.from({ length: 8 }, (_, index) => ({ path: `input-${index}.md`, content: null })))).toHaveLength(8)
  expect(() => parseConversationFileEntries(Array.from({ length: 9 }, (_, index) => ({ path: `input-${index}.md`, content: null })))).toThrow(/count|limit/i)
  expect(parseConversationFileEntries([{ path: 'bounded.txt', content: 'x'.repeat(32768) }])).toHaveLength(1)
  expect(() => parseConversationFileEntries([{ path: 'overflow.txt', content: 'x'.repeat(32769) }])).toThrow(/byte|limit/i)
  expect(parseConversationFileMaterial(files)).toEqual(files)
  expect(parseConversationFileResult(result)).toEqual(result)
  expect(parseConversationFileTrialReceipt(receipt)).toEqual(receipt)
  expect(Object.keys(parseConversationFileMaterial(files))).toEqual(['schemaVersion', 'outputKind', 'cwd', 'entries', 'outputPaths'])
  expect(Object.keys(parseConversationFileResult(result))).toEqual(['schemaVersion', 'outputKind', 'inputsDigest', 'captureSeq', 'outputPaths', 'entries'])
  expect(Object.keys(parseConversationFileTrialReceipt(receipt))).toEqual(['schemaVersion', 'outputKind', 'answer', 'files', 'outputDigest', 'workerMaterialDigest', 'executionProof'])
  expect(guidanceInputDigest('  Summarize   pilot. ', files)).toBe(sha256({ request: 'Summarize pilot.', files }))
})

it.each(['accepted', 'rejected', 'unknown', 'explored', 'recover', 'retention-failure', 'consent-retention', 'feedback', 'feedback-clue', 'feedback-clue-alone', 'feedback-clue-withdrawn-before-proposal', 'feedback-clue-withdraw-after-activation', 'feedback-clue-recover', 'feedback-clue-recover-substituted', 'chat', 'recover-incomplete', 'recover-changed-native', 'recover-source-explored-before', 'recover-source-explored-after'] as const)('uses actual isolated native files through natural review and ten-arm study: %s', async scenario => {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'file-learning-'))
  const evolutionRoot = join(root, 'evolution')
  const chat = scenario === 'chat'; const explored = scenario.includes('explored'); const clueOnly = scenario === 'feedback-clue-alone'; const activeClue = scenario.startsWith('feedback-clue') && scenario !== 'feedback-clue-withdrawn-before-proposal'; const recover = scenario.startsWith('recover') || scenario.startsWith('feedback-clue-recover'); const withSource = scenario.includes('source'); const sourceAfter = scenario.endsWith('after')
  const definition = { name: 'file-scope-reference', provider: 'owned-test-fixture', source: 'bundled', description: 'Scope reference', invocation: { modelInvocable: true, userInvocable: true }, content: 'Preserve source scope in a file.' }
  const sourceAdmission = { name: definition.name, provider: definition.provider, digest: sha256(definition), origin: 'https://example.invalid/owned-test-fixture', revision: 'fixture-v1', license: 'MIT' as const, reviewedAt: '2026-09-08T00:00:00.000Z', kind: 'self-contained-text' as const, runtime: '0.1.1-rc.2' as const, purpose: 'conversation-method-reference' as const,
    scopeKey: `conversation:${sha256({ cwd: root })}`, environmentDigest: sha256({ kind: 'tianwen.conversation-skill-environment.v1', evolutionRoot }) }
  const loopConfig = { evolutionRoot, ...(withSource ? { skillSources: [sourceAdmission] } : {}) }
  const finalProposal = () => ({ guidance: 'Preserve pilot scope in the output file.', ...(withSource ? { sourceUse: { readDigest: sha256(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.sourceReference!), status: 'adapted', rationale: 'Use the scope reference.' } } : {}) })
  const exploration = (material: { sourceTaskIds: string[] }) => ({ exploration: { sourceTaskId: material.sourceTaskIds[0], hypothesis: 'Scope ignored.', alternative: 'Input misunderstood.', temporaryInstruction: 'Check pilot scope.', expectedIfHypothesis: { control: 'not-met', treatment: 'met' }, expectedIfAlternative: { control: 'not-met', treatment: 'not-met' } } })
  const script: ScriptEntry[] = []
  for (let i = 1; i <= 3; i++) script.push(structured({ ...admission, ...(clueOnly && i === 3 ? { family: 'writing' } : {}), fileOutputKind: chat ? 'chat' : 'files' }), toolCallResponse(`read-${i}`, 'read', { file_path: 'input.md' }),
    ...(chat ? [] : [toolCallResponse(`write-${i}`, 'write', { file_path: 'output.md', content: `pilot original ${i}` })]), textResponse('pilot saved'), ...pair(i === 3 ? 'met' : 'not-met'))
  if (scenario.startsWith('feedback-clue')) script.push(structured(admission), toolCallResponse('read-clue', 'read', { file_path: 'input.md' }), textResponse('partial reply without a saved output'), ...pair('inconclusive'))
  if (scenario.startsWith('feedback')) script.push(structured({ classification: 'attributable-problem', category: 'source-fidelity', supplementalCriteria: ['Retain pilot scope.'], explanation: 'The original output contains the claimed issue.', evidenceQuotes: [scenario.startsWith('feedback-clue') ? 'partial reply without a saved output' : 'pilot original 1'] }))
  const generated = (kind: string) => ({ prompt: `Summarize ${kind} pilot input.`, criteria: ['Preserve pilot scope.'], files: { entries: [{ path: 'input.md', content: `pilot ${kind}` }, ...(chat ? [] : [{ path: 'output.md', content: null }])], outputPaths: chat ? [] : ['output.md'] } })
  if (!clueOnly) script.push(request => {
    if (scenario.startsWith('feedback-clue')) expect(materialOf(request).proposalClues).toBeUndefined()
    return structured({ adjacent: generated('adjacent'), holdout: generated('holdout') })
  })
  if (!clueOnly) script.push(request => {
    const material = materialOf(request)
    expect(material.sources.every((source: { files?: unknown }) => source.files !== undefined)).toBe(true)
    if (activeClue) {
      expect(material.proposalClues).toMatchObject([{ schemaVersion: 'tianwen.proposal-clue.v1', classification: 'attributable-problem', category: 'source-fidelity', supplementalCriteria: ['Retain pilot scope.'] }])
      expect(JSON.stringify(material.proposalClues)).not.toMatch(/toolEvidence|fileResult|files|ancillary|context/i)
    }
    if (scenario === 'feedback-clue-withdrawn-before-proposal') expect(material.proposalClues).toBeUndefined()
    if (withSource && !sourceAfter) return structured({ inspectSource: definition.name })
    if (explored) return structured(exploration(material))
    return structured({ guidance: 'Preserve pilot scope in the output file.' })
  })
  if (!clueOnly && withSource && !sourceAfter) script.push(request => structured(exploration(materialOf(request))))
  let checks = 0
  const trial = (label: string, verdict: 'met' | 'not-met' | 'inconclusive') => {
    script.push(toolCallResponse(`read-${label}`, 'read', { file_path: 'input.md' }), ...(chat ? [] : [toolCallResponse(`write-${label}`, 'write', { file_path: 'output.md', content: `pilot ${label}` })]), textResponse(chat ? `pilot ${label}` : 'pilot saved'))
    for (const response of pair(verdict)) script.push(request => {
      const study = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!
      expect(study.fileTrials?.length).toBe(Math.floor(checks++ / 2) + 1)
      if (scenario === 'recover-incomplete' && checks === 2) throw new Error('second review interrupted')
      const material = materialOf(request)
      if (activeClue) expect(JSON.stringify(request.messages)).not.toContain('tianwen.proposal-clue.v1')
      if (chat) expect(material.original.fileResult.answer).toBe(`pilot ${label}`)
      else expect(material.original.fileResult.files.find((entry: { path: string }) => entry.path === 'output.md').content).toBe(`pilot ${label}`)
      expect(material.claimEvidence.items.filter((item: { role: string }) => item.role === 'answer').some((item: { filePath: string }) => item.filePath === 'output.md')).toBe(!chat)
      return (response as (request: GenerateOptions) => ReturnType<typeof textResponse>)(request)
    })
  }
  if (!clueOnly && explored) {
    trial('control', 'not-met'); trial('treatment', 'met')
    script.push(request => { const material = materialOf(request); expect(material.exploration.answers.every((answer: { files?: unknown, outputDigest?: unknown }) => answer.files !== undefined && answer.outputDigest !== undefined)).toBe(true); return structured(withSource && sourceAfter ? { inspectSource: definition.name } : finalProposal()) })
    if (withSource && sourceAfter) script.push(() => structured(finalProposal()))
  }
  if (!clueOnly) for (let i = 0; i < 5; i++) for (const role of ['baseline', 'candidate'] as const) trial(`${i}-${role}`, role === 'baseline' && i === 0 ? 'not-met' : role === 'candidate' && i === 4 && (scenario === 'rejected' || scenario === 'unknown') ? scenario === 'rejected' ? 'not-met' : 'inconclusive' : 'met')
  if (scenario === 'feedback-clue-recover-substituted') script.push(structured({ guidance: 'Preserve pilot scope in the output file.' }))
  const harness = await (scenario.startsWith('feedback') ? mountFeedbackHarness : mountPersistentHarness)(join(root, 'sessions'), script)
  const presetRoot = join(root, 'presets'); mkdirSync(join(presetRoot, 'files'), { recursive: true })
  writeFileSync(join(presetRoot, 'files', 'agent.cordis.yml'), `- id: file-tools\n  name: '${fileToolsPath}'\n  config: {}\n`)
  await harness.ctx.plugin(localFs.default, { cwd: root }); await harness.ctx.plugin(Loader)
  await harness.ctx.plugin(presets.default, { default: 'files', roots: [{ path: presetRoot, trust: 'system' }], includeUserRoot: false })
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await applyRuntime(harness.ctx, { evolutionRoot })
  if (withSource) { await harness.ctx.plugin(SkillRegistry); harness.ctx.skills.register(definition) }
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await harness.ctx.plugin(TianwenConversationFileObserverService); await harness.ctx.plugin(TianwenConversationObserverService)
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('natural-files'), meta: { cwd: root, agentPreset: 'files' }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' }, setup: async ctx => { await harness.ctx.agentPresets.mount(ctx, 'files') } })
  let stopped = false
  let nativeFeedbackVersion: string | undefined
  try {
    for (let i = 1; i <= 3; i++) {
      writeFileSync(join(root, 'input.md'), `pilot source ${i}`)
      handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: `Summarize pilot input ${i} into output.md.` }] }))
      await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    }
    expect(harness.ctx.tianwenEvolution.listConversationTasks().map(task => task.review?.verdict)).toEqual(['not-met', 'not-met', 'met'])
    if (scenario.startsWith('feedback')) {
      await harness.ctx.plugin(TianwenMessageFeedbackBridgeService); await harness.ctx.plugin(TianwenConversationFeedbackService)
      if (scenario.startsWith('feedback-clue')) {
        writeFileSync(join(root, 'input.md'), 'partial clue source')
        handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Summarize this partial file task without writing an output.' }] }))
        await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
      }
      const target = harness.ctx.tianwenEvolution.listConversationTasks()[scenario.startsWith('feedback-clue') ? 3 : 0]!
      const feedback = await harness.ctx.messageFeedback.put({ sessionId: handle.agent.session.id, messageId: MessageId(target.completion!.assistantMessageIds.at(-1)!), rating: 'negative', note: 'The output lost the pilot scope.', ifVersion: null })
      nativeFeedbackVersion = String(feedback.value.version)
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('natural-files'); await harness.ctx.tianwenConversationFeedback.scheduleForSession('natural-files')
      const assessment = harness.ctx.tianwenEvolution.listConversationFeedbackAssessments(target.source.taskId)[0]!
      const material = await harness.ctx.tianwenConversationFeedback.materialForAssessment(assessment)
      if (scenario === 'feedback') {
        expect(material.fileResult?.files.find(entry => entry.path === 'output.md')?.content).toBe('pilot original 1')
        expect(material.original.files?.entries.find(entry => entry.path === 'input.md')?.content).toBe('pilot source 1')
        expect(material.toolEvidence).toEqual([])
      } else expect(material.fileResult).toBeUndefined()
      expect(material.feedback.note).toBe('The output lost the pilot scope.')
      expect(assessment.result?.classification).toBe('attributable-problem')
      if (scenario === 'feedback') return
      if (scenario === 'feedback-clue-withdrawn-before-proposal') {
        await harness.ctx.messageFeedback.delete({ sessionId: handle.agent.session.id, messageId: MessageId(target.completion!.assistantMessageIds.at(-1)!), ifVersion: feedback.value.version })
        await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('natural-files')
        expect(harness.ctx.tianwenEvolution.isConversationFeedbackAssessmentActive(assessment.started.assessmentId)).toBe(false)
      }
      if (clueOnly) {
        const requests = harness.adapter.requests.length
        await harness.ctx.plugin(TianwenConversationGuidanceLoopService, loopConfig)
        await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
        expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
        expect(harness.adapter.requests).toHaveLength(requests)
        return
      }
    }
    const original = chat ? undefined : readFileSync(join(root, 'output.md'), 'utf8')
    const originalRecord = harness.ctx.tianwenEvolution.recordConversationGuidance.bind(harness.ctx.tianwenEvolution)
    const fault = vi.spyOn(harness.ctx.tianwenEvolution, 'recordConversationGuidance').mockImplementation(record => {
      if (recover && record.kind === 'guidance-activated') throw new Error('interrupt activation')
      if (scenario === 'retention-failure' && record.kind === 'study-file-trial-captured') throw new Error('receipt storage failed')
      if (scenario === 'consent-retention' && record.kind === 'study-file-trial-captured') harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
      return originalRecord(record)
    })
    await harness.ctx.plugin(TianwenConversationGuidanceLoopService, loopConfig)
    await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    fault.mockRestore()
    const study = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!
    expect(study).toBeDefined()
    expect(readFileSync(join(root, 'input.md'), 'utf8')).toBe(scenario.startsWith('feedback-clue') ? 'partial clue source' : 'pilot source 3')
    if (activeClue) {
      expect(study.opened.proposalClues).toHaveLength(1)
      expect(study.opened.proposalClues![0]!.taskId).toBe(harness.ctx.tianwenEvolution.listConversationTasks()[3]!.source.taskId)
      expect([...study.opened.sourceTaskIds, study.opened.counterexampleTaskId]).not.toContain(study.opened.proposalClues![0]!.taskId)
      expect(study.arms).toHaveLength(10)
    }
    if (scenario === 'feedback-clue-withdrawn-before-proposal') expect(study.opened.proposalClues).toBeUndefined()
    if (!chat) expect(readFileSync(join(root, 'output.md'), 'utf8')).toBe(original)
    if (scenario === 'retention-failure' || scenario === 'consent-retention') {
      expect(checks).toBe(0); expect(study.fileTrials).toBeUndefined(); expect(study.arms).toEqual([]); expect(study.stopped).toBeDefined(); return
    }
    expect(study.arms).toHaveLength(scenario === 'recover-incomplete' ? 0 : 10)
    expect(study.fileTrials).toHaveLength(scenario === 'recover-incomplete' ? 1 : explored ? 12 : 10)
    expect(study.decision?.verdict).toBe(scenario === 'recover-incomplete' ? undefined : scenario === 'rejected' ? 'rejected' : scenario === 'unknown' ? 'inconclusive' : 'accepted')
    const [baseline, candidate] = study.fileTrials!
    if (!chat) expect(baseline!.receipt.files.find(entry => entry.path === 'output.md')!.content).toContain(explored ? 'control' : '0-baseline')
    if (candidate !== undefined) {
      expect(candidate.receipt.executionProof.sessionId).not.toBe(baseline!.receipt.executionProof.sessionId)
      const baselineNative = await harness.ctx.sessionPersistence.inspect(SessionId(baseline!.receipt.executionProof.sessionId))
      const candidateNative = await harness.ctx.sessionPersistence.inspect(SessionId(candidate.receipt.executionProof.sessionId))
      expect(baselineNative.meta.cwd).toContain('conversation-file-trials')
      expect(candidateNative.meta.cwd).toContain('conversation-file-trials')
      expect(candidateNative.meta.cwd).not.toBe(baselineNative.meta.cwd)
    }
    expect(new EvolutionLedger(evolutionRoot).listEvents().filter(isPublicLedgerEvent).some(event => event.type === 'conversation-guidance-recorded')).toBe(false)
    if (explored) {
      const replay = new ConversationGuidanceState()
      for (const event of new EvolutionLedger(evolutionRoot).listEvents()) if (event.type === 'conversation-guidance-recorded') {
        if (event.record.kind === 'study-file-trial-captured' && event.record.target.kind === 'exploration') {
          expect(() => replay.validate({ ...event.record, target: { ...event.record.target, requestDigest: sha256('unrelated exploration intent') } })).toThrow(/exploration target/)
        }
        replay.validate(event.record); replay.apply(event.record, event.at)
      }
      expect(replay.listStudies()[0]!.exploration?.arms).toHaveLength(2)
    }
    if (scenario === 'feedback-clue-withdraw-after-activation') {
      const target = harness.ctx.tianwenEvolution.listConversationTasks()[3]!
      await harness.ctx.messageFeedback.delete({ sessionId: handle.agent.session.id, messageId: MessageId(target.completion!.assistantMessageIds.at(-1)!), ifVersion: nativeFeedbackVersion! })
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('natural-files')
      await harness.ctx.tianwenConversationGuidanceLoop.schedule(handle.agent)
      await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
      expect(harness.ctx.tianwenEvolution.isConversationGuidanceSupported(study.opened.studyId)).toBe(false)
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.rollback?.reason).toBe('support-retracted')
      expect(harness.ctx.tianwenEvolution.getConversationGuidance(study.opened.scopeKey)).toEqual(study.opened.parentSnapshot)
      return
    }
    if (scenario === 'feedback-clue-recover-substituted') {
      const candidate = study.candidate!
      const value = { guidance: 'Preserve pilot scope in the output file.' }
      const original = await recoverConversationStructuredJudgment(harness.ctx, candidate.proposalProof, value)
      const material = structuredClone(original.material) as { proposalClues: Array<Record<string, unknown>>, sourceReference?: unknown }
      expect(material.sourceReference).toBeUndefined()
      const { proposalClues: originalClues, ...unmodified } = structuredClone(material)
      material.proposalClues = material.proposalClues.map((clue, index) => index === 0
        ? { ...clue, feedback: { ...(clue.feedback as Record<string, unknown>), note: 'Substituted feedback clue payload.' } } : clue)
      const { proposalClues: replacedClues, ...replacementRest } = material
      expect(replacementRest).toEqual(unmodified)
      expect(replacedClues).not.toEqual(originalClues)
      const saved = await harness.ctx.sessionPersistence.inspect(SessionId(candidate.proposalProof.sessionId))
      const config = saved.events.find(event => event.type === 'request/header')!.data.header.config
      const genuine = await runConversationJudgment(harness.ctx, handle.agent, { label: 'Substituted feedback clue payload fixture', instruction: original.instruction,
        material, outputSchema: conversationProposalSchema(study.opened.sourceTaskIds, false), callConfig: config, signal: new AbortController().signal })
      const path = join(root, 'evolution', 'ledger.jsonl')
      const events = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line))
      for (const event of events) if (event.type === 'conversation-guidance-recorded' && event.record.studyId === study.opened.studyId && event.record.kind === 'candidate-recorded') event.record = { ...candidate, proposalProof: genuine.proof }
      writeFileSync(path, events.map(event => JSON.stringify(event) + '\n').join(''))
      expect(new EvolutionLedger(evolutionRoot).hasRecoveryFailure()).toBe(false)
    }
    if (recover) {
      await handle.dispose(); await harness.ctx.fiber.dispose(); stopped = true
      writeFileSync(join(root, 'input.md'), 'current workspace changed')
      const restarted = await (scenario.startsWith('feedback') ? mountFeedbackHarness : mountPersistentHarness)(join(root, 'sessions'), [])
      try {
        await restarted.ctx.plugin(SubagentRuntime); await restarted.ctx.plugin(spawn, { providerName: 'spawn' }); await applyRuntime(restarted.ctx, { evolutionRoot })
        if (scenario === 'recover-changed-native') {
          const inspect = restarted.ctx.sessionPersistence.inspect.bind(restarted.ctx.sessionPersistence)
          vi.spyOn(restarted.ctx.sessionPersistence, 'inspect').mockImplementation(async id => {
            const saved = await inspect(id)
            return String(id) === baseline!.receipt.executionProof.sessionId ? { ...saved, events: saved.events.slice(0, -1) } : saved
          })
        }
        if (scenario.startsWith('feedback-clue-recover')) {
          await restarted.ctx.plugin(TianwenMessageFeedbackBridgeService)
          await restarted.ctx.plugin(TianwenConversationFeedbackService)
        }
        await restarted.ctx.plugin(TianwenConversationGuidanceLoopService, loopConfig)
        const resumed = await restarted.ctx.agents.resume({ resumeSessionId: SessionId('natural-files'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
        await restarted.ctx.tianwenConversationGuidanceLoop.whenIdle()
        if (scenario === 'recover-incomplete' || scenario === 'recover-changed-native' || scenario === 'feedback-clue-recover-substituted') expect(restarted.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.activation).toBeUndefined()
        else expect(restarted.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.activation).toBeDefined()
        expect(restarted.adapter.requests).toHaveLength(0)
        await restarted.ctx.tianwenConversationGuidanceLoop.schedule(resumed.agent)
        expect(new EvolutionLedger(evolutionRoot).listConversationGuidanceStudies()).toHaveLength(1)
        await resumed.dispose()
      } finally { await restarted.ctx.fiber.dispose() }
    }
  } finally { if (!stopped) { await handle.dispose(); await harness.ctx.fiber.dispose() }; rmSync(root, { recursive: true, force: true }) }
})
