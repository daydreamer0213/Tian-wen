import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
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
import type { ConversationExternalCodeCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'
import { conversationCheckedFailureSource } from '../../packages/tianwen-evolution/src/conversation-external-check.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'
import { TianwenConversationFeedbackService } from '../../packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.js'
import { TianwenMessageFeedbackBridgeService } from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'
import { CONVERSATION_MATERIAL_MAX_BYTES, conversationProposalSchema, recoverConversationStructuredJudgment, runConversationJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { recoverConversationCaseDesign } from '../../packages/tianwen-runtime-bundle/src/conversation-case-design.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { EvolutionLedger, isPublicLedgerEvent } from '../../packages/tianwen-evolution/src/ledger.js'
import { ConversationGuidanceState } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { guidanceInputDigest } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import * as studyEvidence from '../../packages/tianwen-runtime-bundle/src/guidance-review-packet.js'
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
const structured = (value: Record<string, unknown>) => toolCallResponse('result', 'structured_output',
  'kind' in value && 'evaluationMode' in value ? { decision: value } : value)
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
  expect(parseConversationFileEntries([{ path: 'bounded.txt', content: 'x'.repeat(98304) }])).toHaveLength(1)
  expect(() => parseConversationFileEntries([{ path: 'overflow.txt', content: 'x'.repeat(98305) }])).toThrow(/byte|limit/i)
  expect(parseConversationFileMaterial(files)).toEqual(files)
  expect(parseConversationFileResult(result)).toEqual(result)
  expect(parseConversationFileTrialReceipt(receipt)).toEqual(receipt)
  expect(Object.keys(parseConversationFileMaterial(files))).toEqual(['schemaVersion', 'outputKind', 'cwd', 'entries', 'outputPaths'])
  expect(Object.keys(parseConversationFileResult(result))).toEqual(['schemaVersion', 'outputKind', 'inputsDigest', 'captureSeq', 'outputPaths', 'entries'])
  expect(Object.keys(parseConversationFileTrialReceipt(receipt))).toEqual(['schemaVersion', 'outputKind', 'answer', 'files', 'outputDigest', 'workerMaterialDigest', 'executionProof'])
  expect(guidanceInputDigest('  Summarize   pilot. ', files)).toBe(sha256({ request: 'Summarize pilot.', files }))
})

for (const historicalFileClue of [false, true])
for (const scenario of ['pre-design-late-cancel', 'pre-design-pass', 'pre-design-recover', 'pre-design-missing', 'pre-design-drift', 'pre-design-duplicate', 'pre-design-cancel', 'pre-design-invalid', 'pre-design-check-missing', 'result-check-late-cancel', 'result-check-consent', 'result-check-native-drift', 'result-check-pass', 'result-check-rejected', 'result-check-exception', 'result-check-missing', 'result-check-recover', 'result-check-rejected-recover', 'duplicate-case-order', 'duplicate-case-path-case', 'duplicate-case-source-order', 'accepted', 'packet-quarantined', 'checked-failure', 'rejected', 'unknown', 'explored', 'recover', 'retention-failure', 'consent-retention', 'feedback', 'feedback-study', 'feedback-clue', 'feedback-clue-external', 'feedback-clue-packet-overflow', 'feedback-clue-frozen-overflow', 'feedback-clue-alone', 'feedback-clue-withdrawn-before-proposal', 'feedback-clue-withdraw-after-frozen-before-proposal', 'feedback-clue-withdraw-after-activation', 'feedback-clue-native-model-drift', 'feedback-clue-recover', 'feedback-clue-recover-projection-drift', 'feedback-clue-recover-substituted', 'chat', 'recover-incomplete', 'recover-changed-native', 'recover-source-explored-before', 'recover-source-explored-after'] as const) if (!historicalFileClue || ['feedback-clue-alone', 'feedback-clue-withdrawn-before-proposal', 'feedback-clue-withdraw-after-frozen-before-proposal', 'feedback-clue-withdraw-after-activation', 'feedback-clue-native-model-drift', 'feedback-clue-recover', 'feedback-clue-recover-substituted'].includes(scenario)) it(`uses actual isolated native files through natural review and ten-arm study: ${scenario}${historicalFileClue ? ' (legacy-v1)' : ''}`, async () => {
  const base = process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'file-learning-'))
  if (process.env.TIANWEN_FILE_TEST_ROOT !== undefined) expect(root.replaceAll('\\', '/').startsWith(`${base.replaceAll('\\', '/')}/`)).toBe(true)
  const evolutionRoot = join(root, 'evolution')
  const preDesign = scenario.startsWith('pre-design')
  const studyCheck = scenario.startsWith('result-check') || preDesign
  let inputPreparations = 0; let requestsBeforeStudy = 0
  let preparedCases = 0; let evaluatedArms = 0
  let disposeStudyLoop: (() => Promise<unknown>) | undefined
  let lateDisposal: Promise<unknown> | undefined
  const checkedSources = scenario === 'checked-failure'
  const requiredCondition = "The requested output.md must contain 'pilot verified'."
  const chat = scenario === 'chat'; const explored = scenario.includes('explored'); const clueOnly = scenario === 'feedback-clue-alone'; const packetOverflow = scenario === 'feedback-clue-packet-overflow'; const frozenWithdrawal = scenario === 'feedback-clue-withdraw-after-frozen-before-proposal'; const nativeModelDrift = scenario === 'feedback-clue-native-model-drift'; const activeClue = scenario.startsWith('feedback-clue') && !['feedback-clue-withdrawn-before-proposal', 'feedback-clue-native-model-drift', 'feedback-clue-packet-overflow'].includes(scenario); const recover = studyCheck && scenario.endsWith('recover') || scenario.startsWith('recover') || scenario.startsWith('feedback-clue-recover'); const withSource = scenario.includes('source') && !scenario.startsWith('duplicate-case'); const sourceAfter = scenario.endsWith('after')
  const externalClue = !historicalFileClue && scenario.startsWith('feedback-clue') && scenario !== 'feedback-clue'
  const lateOverflow = scenario === 'feedback-clue-frozen-overflow'
  const definition = { name: 'file-scope-reference', provider: 'owned-test-fixture', source: 'bundled', description: 'Scope reference', invocation: { modelInvocable: true, userInvocable: true }, content: 'Preserve source scope in a file.' }
  const sourceAdmission = { name: definition.name, provider: definition.provider, digest: sha256(definition), origin: 'https://example.invalid/owned-test-fixture', revision: 'fixture-v1', license: 'MIT' as const, reviewedAt: '2026-09-08T00:00:00.000Z', kind: 'self-contained-text' as const, runtime: '0.1.1-rc.2' as const, purpose: 'conversation-method-reference' as const,
    scopeKey: `conversation:${sha256({ cwd: root })}`, environmentDigest: sha256({ kind: 'tianwen.conversation-skill-environment.v1', evolutionRoot }) }
  const loopConfig = { evolutionRoot, ...(scenario === 'packet-quarantined' || checkedSources ? { guidanceActivationQuarantine: true } : {}), ...(withSource ? { skillSources: [sourceAdmission] } : {}), ...(studyCheck ? { studyResultCheck: { ...(preDesign ? { async prepareIndependentCases(material: { sources: readonly unknown[], counterexample: unknown, signal: AbortSignal }) {
    inputPreparations++
    expect(material.sources).toHaveLength(2)
    expect(material.counterexample).toBeDefined()
    expect(material).not.toHaveProperty('guidance')
    expect(preparedCases).toBe(0)
    expect(harness.adapter.requests).toHaveLength(requestsBeforeStudy)
    if (scenario === 'pre-design-missing') return undefined
    if (scenario === 'pre-design-late-cancel') {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      lateDisposal = disposeStudyLoop!()
      await new Promise<void>(resolve => material.signal.aborted ? resolve() : material.signal.addEventListener('abort', () => resolve(), { once: true }))
    }
    if (scenario === 'pre-design-cancel') harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    const adjacent = generated('adjacent'), holdout = scenario === 'pre-design-duplicate' ? adjacent : generated('holdout')
    if (scenario === 'pre-design-invalid') holdout.criteria = []
    return { adjacent, holdout }
  } } : {}), async prepare(material: import('../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js').ConversationStudyResultPreparation) {
    preparedCases++
    expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toHaveLength(0)
    expect(material).not.toHaveProperty('answer')
    expect(material).not.toHaveProperty('role')
    expect(material.criteria).toContain(requiredCondition)
    if ((scenario === 'result-check-missing' || scenario === 'pre-design-check-missing') && material.caseId === 'holdout') return undefined
    return { checkerId: 'owned-study-fixture', checkerDigest: sha256('owned-study-fixture-v1'), contractDigest: sha256({ requiredCondition, inputs: material.files.entries }),
      requiredCondition, inputs: structuredClone(material.files.entries), async evaluate(candidate: import('../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js').ConversationStudyResultCandidate) {
        evaluatedArms++
        expect(preparedCases).toBe(5)
        expect(candidate).not.toHaveProperty('role'); expect(candidate).not.toHaveProperty('guidance'); expect(candidate).not.toHaveProperty('verdict')
        expect(candidate.inputs).toEqual(material.files.entries)
        if (scenario === 'result-check-late-cancel') {
          const designId = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.opened.caseDesignProof!.sessionId
          const inspect = harness.ctx.sessionPersistence.inspect.bind(harness.ctx.sessionPersistence)
          vi.spyOn(harness.ctx.sessionPersistence, 'inspect').mockImplementation(async id => {
            const saved = await inspect(id)
            if (String(id) === designId && lateDisposal === undefined) {
              lateDisposal = disposeStudyLoop!()
              await new Promise<void>(resolve => candidate.signal.aborted ? resolve() : candidate.signal.addEventListener('abort', () => resolve(), { once: true }))
            }
            return saved
          })
        }
        if (scenario === 'result-check-consent') harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
        if (scenario === 'result-check-native-drift') {
          const trial = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.fileTrials!.at(-1)!
          const inspect = harness.ctx.sessionPersistence.inspect.bind(harness.ctx.sessionPersistence)
          vi.spyOn(harness.ctx.sessionPersistence, 'inspect').mockImplementation(async id => {
            const saved = await inspect(id)
            return String(id) === trial.receipt.executionProof.sessionId ? { ...saved, events: saved.events.slice(0, -1) } : saved
          })
        }
        if (scenario === 'result-check-exception') throw new Error('owned check unavailable')
        return candidate.outputs.find(file => file.path === 'output.md')?.content?.includes('pilot verified')
          ? { status: 'verified' as const, detail: 'Required text present.' }
          : { status: 'rejected' as const, detail: 'Required text absent.', failedRequiredConditionDigest: sha256(requiredCondition) }
      } }
  } } } : {}) }
  const finalProposal = () => ({ guidance: 'Preserve pilot scope in the output file.', ...(withSource ? { sourceUse: { readDigest: sha256(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.sourceReference!), status: 'adapted', rationale: 'Use the scope reference.' } } : {}) })
  const exploration = (material: { sourceTaskIds: string[] }) => ({ exploration: { sourceTaskId: material.sourceTaskIds[0], hypothesis: 'Scope ignored.', alternative: 'Input misunderstood.', temporaryInstruction: 'Check pilot scope.', expectedIfHypothesis: { control: 'not-met', treatment: 'met' }, expectedIfAlternative: { control: 'not-met', treatment: 'not-met' } } })
  const script: ScriptEntry[] = []
  for (let i = 1; i <= 3; i++) script.push(structured({ ...admission, ...(checkedSources || studyCheck ? { family: 'code', criteria: [requiredCondition] } : {}), ...(clueOnly && i === 3 ? { family: 'writing' } : {}), fileOutputKind: chat ? 'chat' : 'files' }), toolCallResponse(`read-${i}`, 'read', { file_path: 'input.md' }),
    ...(chat ? [] : [toolCallResponse(`write-${i}`, 'write', { file_path: 'output.md', content: (checkedSources || studyCheck) && i === 3 ? 'pilot verified original 3' : `pilot original ${i}` })]), textResponse('pilot saved'), ...pair(checkedSources || i === 3 ? 'met' : 'not-met'))
  if (scenario.startsWith('feedback-clue')) script.push(structured(externalClue ? { ...admission, evaluationMode: 'external', fileOutputKind: undefined } : admission),
    ...(externalClue ? [structured({ ...admission, evaluationMode: 'external', fileOutputKind: undefined })] : []),
    toolCallResponse('read-clue', 'read', { file_path: 'input.md' }), textResponse('partial reply without a saved output'), ...(externalClue ? pair('inconclusive') : []))
  if (scenario.startsWith('feedback')) script.push(structured({ classification: 'attributable-problem', category: 'source-fidelity', supplementalCriteria: ['Retain pilot scope.'], explanation: 'The original output contains the claimed issue.', evidenceQuotes: [scenario.startsWith('feedback-clue') ? 'partial reply without a saved output' : 'pilot original 1'] }))
  const generated = (kind: string) => ({ prompt: `Summarize ${kind} pilot input.${studyCheck ? ` ${requiredCondition}` : ''}`, criteria: studyCheck ? [requiredCondition] : ['Preserve pilot scope.'], files: { entries: [{ path: 'input.md', content: `pilot ${kind}` }, ...(chat ? [] : [{ path: 'output.md', content: null }])], outputPaths: chat ? [] : ['output.md'] } })
  if (!clueOnly) script.push(request => {
    if (checkedSources) {
      const material = materialOf(request)
      expect(material.checkedFailureSources).toEqual(harness.ctx.tianwenEvolution.listConversationTasks().slice(0, 2).map(conversationCheckedFailureSource))
      expect(material.sources.every((source: Record<string, unknown>) => source.checkedFailureSources === undefined)).toBe(true)
    }
    if (preDesign) {
      expect(inputPreparations).toBe(1); expect(preparedCases).toBe(5)
      expect(materialOf(request).independentCases).toEqual({ adjacent: generated('adjacent'), holdout: generated('holdout') })
      expect(materialOf(request)).not.toHaveProperty('resultChecks')
      if (scenario === 'pre-design-drift') return structured({ adjacent: generated('adjacent'), holdout: { ...generated('holdout'), criteria: ['Ignore the frozen requirement.'] } })
    }
    if (scenario.startsWith('feedback-clue')) expect(materialOf(request).proposalClues).toBeUndefined()
    if (scenario.startsWith('duplicate-case')) {
      const adjacent = generated('adjacent')
      if (scenario === 'duplicate-case-source-order') {
        const source = materialOf(request).sources[0]
        return structured({ adjacent: { prompt: 'Summarize pilot input 1 into output.md.', criteria: adjacent.criteria,
          files: { entries: [...source.files.entries].reverse(), outputPaths: source.files.outputPaths } }, holdout: generated('holdout') })
      }
      return structured({ adjacent, holdout: { ...adjacent, files: { ...adjacent.files,
        entries: scenario === 'duplicate-case-order' ? [...adjacent.files.entries].reverse()
          : adjacent.files.entries.map(entry => ({ ...entry, path: entry.path.toUpperCase() })),
        outputPaths: scenario === 'duplicate-case-path-case' ? adjacent.files.outputPaths.map(path => path.toUpperCase()) : adjacent.files.outputPaths } } })
    }
    return structured({ adjacent: generated('adjacent'), holdout: generated('holdout') })
  })
  if (!clueOnly) script.push(request => {
    const material = materialOf(request)
    if (checkedSources) {
      expect(material.checkedFailureSources).toEqual(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.opened.checkedFailureSources)
      expect(material.sources.every((source: Record<string, unknown>) => source.checkedFailureSources === undefined)).toBe(true)
    }
    expect(material.sources.every((source: { files?: unknown }) => source.files !== undefined)).toBe(true)
    if (activeClue) {
      expect(material.proposalClues).toMatchObject([{ schemaVersion: 'tianwen.proposal-clue.v1', classification: 'attributable-problem', category: 'source-fidelity', supplementalCriteria: ['Retain pilot scope.'] }])
      expect(JSON.stringify(material.proposalClues)).not.toMatch(/toolEvidence|fileResult|files|ancillary|context/i)
    }
    if (scenario === 'feedback-clue-withdrawn-before-proposal') expect(material.proposalClues).toBeUndefined()
    if (nativeModelDrift) expect(material.proposalClues).toBeUndefined()
    if (withSource && !sourceAfter) return structured({ inspectSource: definition.name })
    if (explored) return structured(exploration(material))
    return structured({ guidance: 'Preserve pilot scope in the output file.' })
  })
  if (!clueOnly && withSource && !sourceAfter) script.push(request => structured(exploration(materialOf(request))))
  let checks = 0
  const trial = (label: string, verdict: 'met' | 'not-met' | 'inconclusive') => {
    script.push(request => {
      if (checkedSources) expect(JSON.stringify(request.messages)).not.toContain('checkedFailureSources')
      return toolCallResponse(`read-${label}`, 'read', { file_path: 'input.md' })
    }, ...(chat ? [] : [toolCallResponse(`write-${label}`, 'write', { file_path: 'output.md', content: studyCheck && label !== '0-baseline' && !(scenario.includes('rejected') && label === '4-candidate') ? `pilot verified ${label}` : `pilot ${label}` })]), textResponse(chat ? `pilot ${label}` : 'pilot saved'))
    for (const response of pair(verdict)) script.push(request => {
      const study = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!
      expect(study.fileTrials?.length).toBe(Math.floor(checks++ / 2) + 1)
      if (scenario === 'recover-incomplete' && checks === 2) throw new Error('second review interrupted')
      const material = materialOf(request)
      const retainedTrial = study.fileTrials!.at(-1)!.receipt
      expect(material.original.trialExecution).toMatchObject({ executionProof: retainedTrial.executionProof, outputDigest: retainedTrial.outputDigest,
        actions: chat ? [{ tool: 'read', path: 'input.md', status: 'success' }]
          : [{ tool: 'read', path: 'input.md', status: 'success' }, { tool: 'write', path: 'output.md', status: 'success' }] })
      expect(material.claimEvidence.items.some((item: { role: string, text: string }) => item.role === 'tool' && item.text.startsWith('Native trial read "input.md"'))).toBe(true)
      expect(material.claimEvidence.items.some((item: { role: string, text: string }) => item.role === 'tool' && item.text.startsWith('Native trial write "output.md"'))).toBe(!chat)
      if (activeClue) expect(JSON.stringify(request.messages)).not.toContain('tianwen.proposal-clue.v1')
      if (checkedSources) expect(JSON.stringify(request.messages)).not.toContain('checkedFailureSources')
      if (chat) expect(material.original.fileResult.answer).toBe(`pilot ${label}`)
      else expect(material.original.fileResult.files.find((entry: { path: string }) => entry.path === 'output.md').content).toBe(`pilot ${studyCheck && label !== '0-baseline' && !(scenario.includes('rejected') && label === '4-candidate') ? 'verified ' : ''}${label}`)
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
  if (scenario === 'feedback-clue-recover-substituted' || checkedSources) script.push(structured({ guidance: 'Preserve pilot scope in the output file.' }))
  const harness = await (scenario.startsWith('feedback') ? mountFeedbackHarness : mountPersistentHarness)(join(root, 'sessions'), script)
  const presetRoot = join(root, 'presets'); mkdirSync(join(presetRoot, 'files'), { recursive: true })
  writeFileSync(join(presetRoot, 'files', 'agent.cordis.yml'), `- id: file-tools\n  name: '${fileToolsPath}'\n  config: {}\n`)
  await harness.ctx.plugin(localFs.default, { cwd: root }); await harness.ctx.plugin(Loader)
  await harness.ctx.plugin(presets.default, { default: 'files', roots: [{ path: presetRoot, trust: 'system' }], includeUserRoot: false })
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await applyRuntime(harness.ctx, { evolutionRoot })
  if (historicalFileClue || scenario === 'feedback-clue') {
    const record = harness.ctx.tianwenEvolution.recordConversationLearning.bind(harness.ctx.tianwenEvolution)
    vi.spyOn(harness.ctx.tianwenEvolution, 'recordConversationLearning').mockImplementation(value => record(value.kind === 'task-started' ? { ...value, proposalCluePolicy: 'feedback.v1' } : value))
  }
  if (withSource) { await harness.ctx.plugin(SkillRegistry); harness.ctx.skills.register(definition) }
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const externalCodeCheck: ConversationExternalCodeCheck = { async prepare() {
    const inputs = ['input.md', 'output.md'].map(path => ({ path, content: existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null }))
    return { checkerId: 'owned-required-output-fixture', checkerDigest: sha256('owned-required-output-fixture-v1'), contractDigest: sha256({ requiredCondition, inputs }), requiredCondition, inputs,
      async evaluate(candidate) { return candidate.outputs.find(file => file.path === 'output.md')?.content?.includes('pilot verified')
        ? { status: 'verified', detail: 'Frozen original required text is present.' }
        : { status: 'rejected', detail: 'Frozen original required text is absent.', failedRequiredConditionDigest: sha256(requiredCondition) } } }
  } }
  await harness.ctx.plugin(TianwenConversationFileObserverService, checkedSources ? { externalCodeArtifacts: true } : {})
  await harness.ctx.plugin(TianwenConversationObserverService, checkedSources ? { externalCodeCheck } : {})
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('natural-files'), meta: { cwd: root, agentPreset: 'files' }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' }, setup: async ctx => { await harness.ctx.agentPresets.mount(ctx, 'files') } })
  let stopped = false
  let nativeFeedbackVersion: string | undefined
  let packetClueCalls = 0
  const packetErrors: string[] = []
  try {
    for (let i = 1; i <= 3; i++) {
      writeFileSync(join(root, 'input.md'), `pilot source ${i}`)
      handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: checkedSources || studyCheck ? `Repair output.md using pilot input ${i}. ${requiredCondition}` : `Summarize pilot input ${i} into output.md.` }] }))
      await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    }
    expect(harness.ctx.tianwenEvolution.listConversationTasks().map(task => task.review?.verdict)).toEqual(checkedSources ? ['met', 'met', 'met'] : ['not-met', 'not-met', 'met'])
    if (checkedSources) expect(harness.ctx.tianwenEvolution.listConversationTasks().map(task => task.externalCheckFinished?.status)).toEqual(['rejected', 'rejected', 'verified'])
    if (scenario.startsWith('feedback')) {
      await harness.ctx.plugin(TianwenMessageFeedbackBridgeService); await harness.ctx.plugin(TianwenConversationFeedbackService)
      if (scenario.startsWith('feedback-clue')) {
        writeFileSync(join(root, 'input.md'), 'partial clue source')
        handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Summarize this partial file task without writing an output.' }] }))
        await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
        if (!externalClue) expect(harness.ctx.tianwenEvolution.listConversationTasks()[3]?.review).toMatchObject({ verdict: 'inconclusive', proof: null, unavailableReason: 'file-evidence-unavailable' })
      }
      const target = harness.ctx.tianwenEvolution.listConversationTasks()[scenario.startsWith('feedback-clue') ? 3 : 0]!
      const feedback = await harness.ctx.messageFeedback.put({ sessionId: handle.agent.session.id, messageId: MessageId(target.completion!.assistantMessageIds.at(-1)!), rating: 'negative', note: 'The output lost the pilot scope.', ifVersion: null })
      nativeFeedbackVersion = String(feedback.value.version)
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('natural-files'); await harness.ctx.tianwenConversationFeedback.scheduleForSession('natural-files')
      const assessment = harness.ctx.tianwenEvolution.listConversationFeedbackAssessments(target.source.taskId)[0]!
      const material = await harness.ctx.tianwenConversationFeedback.materialForAssessment(assessment)
      if (scenario === 'feedback' || scenario === 'feedback-study') {
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
      if (packetOverflow || lateOverflow) {
        const service = harness.ctx.tianwenConversationFeedback
        const original = service.proposalClueForAssessment.bind(service)
        vi.spyOn(service, 'proposalClueForAssessment').mockImplementation(async assessment => {
          packetClueCalls++
          try { const native = await original(assessment)
            if (lateOverflow && packetClueCalls === 1) return native
            return { ...native, answer: [{ id: 'oversized-clue-answer', role: 'assistant', content: [{ type: 'text', text: '界'.repeat(Math.ceil(CONVERSATION_MATERIAL_MAX_BYTES / 3)) }] }] as never }
          } catch (error) { packetErrors.push(String(error)); throw error }
        })
      }
      if (nativeModelDrift) {
        const expectedDigest = harness.ctx.tianwenEvolution.listConversationTasks()[0]!.models![0]!.modelConfigDigest
        expect(target.models?.every(model => model.modelConfigDigest === expectedDigest)).toBe(true)
        const headerSeq = target.models![0]!.headerSeq
        const inspect = harness.ctx.sessionPersistence.inspect.bind(harness.ctx.sessionPersistence)
        vi.spyOn(harness.ctx.sessionPersistence, 'inspect').mockImplementation(async id => {
          const saved = await inspect(id)
          return String(id) === String(handle.agent.session.id) ? { ...saved, events: saved.events.map(event => event.seq === headerSeq && event.type === 'request/header'
            ? { ...event, data: { ...event.data, header: { ...event.data.header, config: { ...event.data.header.config, temperature: 0.35 } } } } : event) } : saved
        })
      }
    }
    let frozenNativeWithdrawal: Promise<unknown> | undefined
    const original = chat ? undefined : readFileSync(join(root, 'output.md'), 'utf8')
    const originalRecord = harness.ctx.tianwenEvolution.recordConversationGuidance.bind(harness.ctx.tianwenEvolution)
    const fault = vi.spyOn(harness.ctx.tianwenEvolution, 'recordConversationGuidance').mockImplementation(record => {
      if (frozenWithdrawal && record.kind === 'study-opened') {
        const stored = originalRecord(record)
        const target = harness.ctx.tianwenEvolution.listConversationTasks()[3]!
        const assessment = harness.ctx.tianwenEvolution.listConversationFeedbackAssessments(target.source.taskId)[0]!
        const source = assessment.started.source
        if (source.kind !== 'native') throw new Error('fixture requires native feedback')
        frozenNativeWithdrawal = harness.ctx.messageFeedback.delete({ sessionId: handle.agent.session.id, messageId: MessageId(target.completion!.assistantMessageIds.at(-1)!), ifVersion: nativeFeedbackVersion! })
          .then(async result => { await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('natural-files'); return result })
        harness.ctx.tianwenEvolution.recordLearningFeedbackRetraction({ sessionId: source.sessionId, messageId: source.messageId,
          retractedFeedbackVersion: source.feedbackVersion, sessionLifecycleFingerprint: source.sessionLifecycleFingerprint })
        return stored
      }
      if (recover && record.kind === 'guidance-activated') throw new Error('interrupt activation')
      if (scenario === 'retention-failure' && record.kind === 'study-file-trial-captured') throw new Error('receipt storage failed')
      if (scenario === 'consent-retention' && record.kind === 'study-file-trial-captured') harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
      return originalRecord(record)
    })
    requestsBeforeStudy = harness.adapter.requests.length
    const loopFiber = await harness.ctx.plugin(TianwenConversationGuidanceLoopService, loopConfig)
    disposeStudyLoop = () => loopFiber.dispose()
    await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    await frozenNativeWithdrawal
    fault.mockRestore()
    if (preDesign && !['pre-design-pass', 'pre-design-recover'].includes(scenario)) {
      expect(inputPreparations).toBe(1)
      expect(preparedCases).toBe(['pre-design-drift', 'pre-design-check-missing'].includes(scenario) ? 5 : 0)
      expect(evaluatedArms).toBe(0)
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
      expect(harness.ctx.tianwenEvolution.listConversationCaseDesignAttempts()).toHaveLength(1)
      expect(harness.adapter.requests).toHaveLength(requestsBeforeStudy + (scenario === 'pre-design-drift' ? 1 : 0))
      if (scenario === 'pre-design-late-cancel') {
        await lateDisposal
        expect(harness.ctx.tianwenEvolution.getLearningAnalysisConsent()?.enabled).toBe(true)
        return
      }
      const requests = harness.adapter.requests.length
      await harness.ctx.tianwenConversationGuidanceLoop.schedule(handle.agent)
      expect(harness.adapter.requests).toHaveLength(requests); expect(inputPreparations).toBe(1)
      return
    }
    if (scenario === 'result-check-missing') {
      expect(preparedCases).toBe(5); expect(evaluatedArms).toBe(0)
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
      expect(harness.adapter.requests).toHaveLength(requestsBeforeStudy + 1)
      await harness.ctx.tianwenConversationGuidanceLoop.schedule(handle.agent)
      expect(harness.adapter.requests).toHaveLength(requestsBeforeStudy + 1)
      return
    }
    if (scenario.startsWith('duplicate-case')) {
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
      expect(harness.ctx.tianwenEvolution.listConversationCaseDesignAttempts()).toHaveLength(1)
      expect(harness.adapter.requests).toHaveLength(requestsBeforeStudy + 1)
      expect(readFileSync(join(root, 'input.md'), 'utf8')).toBe('pilot source 3')
      expect(readFileSync(join(root, 'output.md'), 'utf8')).toBe(original)
      await harness.ctx.tianwenConversationGuidanceLoop.schedule(handle.agent)
      expect(harness.adapter.requests).toHaveLength(requestsBeforeStudy + 1)
      await handle.dispose(); await harness.ctx.fiber.dispose(); stopped = true
      const restarted = await mountPersistentHarness(join(root, 'sessions'), [])
      try {
        await restarted.ctx.plugin(SubagentRuntime); await restarted.ctx.plugin(spawn, { providerName: 'spawn' })
        await applyRuntime(restarted.ctx, { evolutionRoot })
        await restarted.ctx.plugin(TianwenConversationGuidanceLoopService, loopConfig)
        const resumed = await restarted.ctx.agents.resume({ resumeSessionId: SessionId('natural-files'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
        try {
          await restarted.ctx.tianwenConversationGuidanceLoop.schedule(resumed.agent)
          await restarted.ctx.tianwenConversationGuidanceLoop.whenIdle()
          expect(restarted.adapter.requests).toHaveLength(0)
          expect(restarted.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
          expect(restarted.ctx.tianwenEvolution.listConversationCaseDesignAttempts()).toHaveLength(1)
        } finally { await resumed.dispose() }
      } finally { await restarted.ctx.fiber.dispose() }
      return
    }
    if (nativeModelDrift) {
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
      return
    }
    const study = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!
    expect(study).toBeDefined()
    if (preDesign) {
      const recovered = await recoverConversationCaseDesign(harness.ctx, study.opened)
      expect(recovered?.material).toMatchObject({ independentCases: { adjacent: generated('adjacent'), holdout: generated('holdout') },
        independentResultChecksDigest: sha256(study.opened.resultChecks) })
      expect(recovered?.semanticIndependence).toBe('unestablished')
      const swapped = study.opened.resultChecks!.map((check, index) => index === 0 ? { ...check, contractDigest: sha256('post-design replacement') } : check)
      await expect(recoverConversationCaseDesign(harness.ctx, { ...study.opened, resultChecks: swapped })).rejects.toThrow('case-design-inputs')
    }
    if (scenario === 'result-check-late-cancel') {
      await lateDisposal
      expect(preparedCases).toBe(5); expect(evaluatedArms).toBe(1)
      expect(harness.ctx.tianwenEvolution.getLearningAnalysisConsent()!.enabled).toBe(true)
      expect(study.arms).toEqual([]); expect(study.fileTrials).toHaveLength(1)
      expect(study.decision).toBeUndefined(); expect(study.activation).toBeUndefined(); expect(study.stopped?.reason).toBe('cancelled')
      vi.restoreAllMocks()
      return
    }
    if (scenario === 'result-check-consent' || scenario === 'result-check-native-drift') {
      expect(preparedCases).toBe(5); expect(evaluatedArms).toBe(1)
      expect(study.arms).toEqual([]); expect(study.fileTrials).toHaveLength(1)
      expect(study.decision).toBeUndefined(); expect(study.activation).toBeUndefined(); expect(study.stopped).toBeDefined()
      const spent = harness.adapter.requests.length
      await harness.ctx.tianwenConversationGuidanceLoop.schedule(handle.agent)
      expect(harness.adapter.requests).toHaveLength(spent)
      vi.restoreAllMocks()
      return
    }
    if (studyCheck) {
      expect(preparedCases).toBe(5); expect(evaluatedArms).toBe(10)
      expect(study.opened.resultChecks).toHaveLength(5)
      expect(study.arms.every(arm => arm.resultCheck !== undefined)).toBe(true)
      expect(study.arms[0]!.resultCheck!.status).toBe(scenario === 'result-check-exception' ? 'unverifiable' : 'rejected')
      expect(study.arms[2]!.resultCheck!.status).toBe(scenario === 'result-check-exception' ? 'unverifiable' : 'verified')
      expect(study.decision?.verdict).toBe('accepted')
      if (scenario.includes('rejected') || scenario === 'result-check-exception' || recover) expect(study.activation).toBeUndefined()
      else expect(study.activation).toBeDefined()
      expect(new EvolutionLedger(evolutionRoot).listConversationGuidanceStudies()[0]).toEqual(study)
      expect(JSON.stringify(harness.adapter.requests)).not.toContain('owned-study-fixture')
    }
    expect(readFileSync(join(root, 'input.md'), 'utf8')).toBe(scenario.startsWith('feedback-clue') ? 'partial clue source' : 'pilot source 3')
    if (frozenWithdrawal) {
      expect(study.opened.proposalClues).toHaveLength(1)
      expect(study.stopped).toBeDefined()
      expect(study.candidate).toBeUndefined()
      expect(harness.adapter.requests).toHaveLength(requestsBeforeStudy + 1)
      return
    }
    if (lateOverflow) {
      expect(study.opened.proposalClues).toHaveLength(1)
      expect(study.stopped?.reason).toBe('source-unavailable')
      expect(study.candidate).toBeUndefined()
      expect(harness.adapter.requests).toHaveLength(requestsBeforeStudy + 1)
      return
    }
    if (activeClue) {
      expect(study.opened.proposalClues).toHaveLength(1)
      expect(study.opened.proposalClues![0]!.taskId).toBe(harness.ctx.tianwenEvolution.listConversationTasks()[3]!.source.taskId)
      expect([...study.opened.sourceTaskIds, study.opened.counterexampleTaskId]).not.toContain(study.opened.proposalClues![0]!.taskId)
      expect(study.arms).toHaveLength(10)
    }
    if (packetOverflow) { if (packetErrors.length) throw new Error(packetErrors.join('\n')); expect(packetClueCalls).toBeGreaterThan(0); expect(study.opened.proposalClues).toBeUndefined() }
    if (scenario === 'feedback-clue-withdrawn-before-proposal') expect(study.opened.proposalClues).toBeUndefined()
    if (nativeModelDrift) expect(study.opened.proposalClues).toBeUndefined()
    if (!chat) expect(readFileSync(join(root, 'output.md'), 'utf8')).toBe(original)
    if (scenario === 'retention-failure' || scenario === 'consent-retention') {
      expect(checks).toBe(0); expect(study.fileTrials).toBeUndefined(); expect(study.arms).toEqual([]); expect(study.stopped).toBeDefined(); return
    }
    expect(study.arms).toHaveLength(scenario === 'recover-incomplete' ? 0 : 10)
    expect(study.fileTrials).toHaveLength(scenario === 'recover-incomplete' ? 1 : explored ? 12 : 10)
    expect(study.decision?.verdict).toBe(scenario === 'recover-incomplete' ? undefined : scenario === 'rejected' ? 'rejected' : scenario === 'unknown' ? 'inconclusive' : 'accepted')
    if (scenario === 'accepted' || scenario === 'packet-quarantined' || checkedSources || scenario === 'chat' || scenario === 'feedback-study') {
      expect(studyEvidence).toHaveProperty('recoverFileGuidanceStudyReviewPacket')
      expect(studyEvidence).toHaveProperty('recoverFileGuidanceArmForReview')
      const beforeRequests = harness.adapter.requests.length
      const beforeLedger = readFileSync(join(evolutionRoot, 'ledger.jsonl'), 'utf8')
      const packet = await studyEvidence.recoverFileGuidanceStudyReviewPacket(harness.ctx, study)
      expect(packet.schemaVersion).toBe('tianwen.file-guidance-review-packet.v1')
      expect(packet.fileOutputKind).toBe(chat ? 'chat' : 'files')
      expect(packet.cases).toHaveLength(5)
      expect(packet.reviewStatus).toBe(scenario === 'packet-quarantined' || checkedSources ? 'unreviewed' : 'diagnostic-historical')
      expect(packet.caseDesign?.semanticIndependence).toBe('unestablished')
      if (checkedSources) {
        expect(study.activation).toBeUndefined()
        expect((packet.caseDesign?.material as Record<string, unknown>).checkedFailureSources).toEqual(study.opened.checkedFailureSources)
        expect((packet.proposalMaterial as Record<string, unknown>).checkedFailureSources).toEqual(study.opened.checkedFailureSources)
        const references = study.opened.checkedFailureSources!
        const substituted = [{ ...references[0], outcomeDigest: sha256('substituted outcome') }, references[1]] as const
        await expect(studyEvidence.recoverFileGuidanceStudyReviewPacket(harness.ctx, { ...study, opened: { ...study.opened, checkedFailureSources: substituted } })).rejects.toThrow('source-unavailable')
      }
      for (const item of packet.cases) {
        if (item.kind !== 'synthetic') expect(item.originalFileResult).toBeDefined()
        expect(item.baseline.task.files).toBeDefined()
        expect(item.candidate.task).toEqual(item.baseline.task)
        if (checkedSources) expect(JSON.stringify(item.baseline.task)).not.toContain('checkedFailureSources')
        for (const arm of [item.baseline, item.candidate]) {
          expect(arm.fileResult).toBeDefined()
          expect(arm.fileResult!.outputDigest).toBe(sha256({ answer: arm.answer, files: arm.fileResult!.files }))
          expect(arm.receipt!.outputKind).toBe(chat ? 'chat' : 'files')
          expect(arm.receipt!.executionProof.sessionId).not.toBe('natural-files')
        }
      }
      if (scenario === 'feedback-study') expect(packet.cases[0]!.feedback?.rawFeedbackIncludedInStudy).toBe(true)
      await expect(studyEvidence.recoverTextGuidanceStudyReviewPacket(harness.ctx, study)).rejects.toThrow('source-unavailable')
      await expect(studyEvidence.recoverFileGuidanceStudyReviewPacket(harness.ctx, { ...study, arms: study.arms.slice(0, 9) })).rejects.toThrow('source-unavailable')
      if (scenario === 'accepted') {
        const first = study.arms[0]!
        await expect(studyEvidence.recoverFileGuidanceArmForReview(harness.ctx, { ...study, fileTrials: [] }, first)).rejects.toThrow('source-unavailable')
        const receipts = study.fileTrials!.map((trial, index) => index === 0 ? { ...trial,
          receipt: { ...trial.receipt, files: trial.receipt.files.map(file => file.path === 'output.md' ? { ...file, content: 'substituted output' } : file) } } : trial)
        await expect(studyEvidence.recoverFileGuidanceArmForReview(harness.ctx, { ...study, fileTrials: receipts }, first)).rejects.toThrow()
        await expect(studyEvidence.recoverFileGuidanceArmForReview(harness.ctx, { ...study, fileTrials: study.fileTrials!.map((trial, index) => index === 0
          ? { ...trial, receipt: study.fileTrials![1]!.receipt } : trial) }, first)).rejects.toThrow('source-unavailable')
        const inspect = harness.ctx.sessionPersistence.inspect.bind(harness.ctx.sessionPersistence)
        const spy = vi.spyOn(harness.ctx.sessionPersistence, 'inspect').mockImplementation(async id => {
          const saved = await inspect(id)
          return String(id) === first.executionProof.sessionId ? { ...saved, events: [] } : saved
        })
        try { await expect(studyEvidence.recoverFileGuidanceStudyReviewPacket(harness.ctx, study)).rejects.toThrow() }
        finally { spy.mockRestore() }
      }
      expect(harness.adapter.requests).toHaveLength(beforeRequests)
      expect(readFileSync(join(evolutionRoot, 'ledger.jsonl'), 'utf8')).toBe(beforeLedger)
      if (checkedSources) {
        const candidate = study.candidate!
        const originalProposal = await recoverConversationStructuredJudgment(harness.ctx, candidate.proposalProof, { guidance: 'Preserve pilot scope in the output file.' })
        const material = structuredClone(originalProposal.material) as { checkedFailureSources: Array<Record<string, unknown>> }
        material.checkedFailureSources[0] = { ...material.checkedFailureSources[0], outcomeDigest: sha256('substituted proposal outcome') }
        const saved = await harness.ctx.sessionPersistence.inspect(SessionId(candidate.proposalProof.sessionId))
        const config = saved.events.find(event => event.type === 'request/header')!.data.header.config
        const changed = await runConversationJudgment(harness.ctx, handle.agent, { label: 'Owned substituted checked-failure reference fixture', instruction: originalProposal.instruction,
          material, outputSchema: conversationProposalSchema(study.opened.sourceTaskIds, false), callConfig: config, signal: new AbortController().signal })
        const ledgerPath = join(evolutionRoot, 'ledger.jsonl')
        const events = beforeLedger.trim().split('\n').map(line => JSON.parse(line))
        for (const event of events) if (event.type === 'conversation-guidance-recorded' && event.record.kind === 'candidate-recorded' && event.record.studyId === study.opened.studyId) event.record = { ...candidate, proposalProof: changed.proof }
        writeFileSync(ledgerPath, events.map(event => JSON.stringify(event) + '\n').join(''))
        const restarted = await mountPersistentHarness(join(root, 'sessions'), [])
        try {
          await restarted.ctx.plugin(SubagentRuntime); await restarted.ctx.plugin(spawn, { providerName: 'spawn' }); await applyRuntime(restarted.ctx, { evolutionRoot })
          const replay = new EvolutionLedger(evolutionRoot)
          expect(replay.hasRecoveryFailure()).toBe(false)
          const persisted = restarted.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!
          expect(persisted.candidate!.proposalProof).toEqual(changed.proof)
          await expect(studyEvidence.recoverFileGuidanceStudyReviewPacket(restarted.ctx, persisted)).rejects.toThrow('source-unavailable')
          expect(restarted.adapter.requests).toHaveLength(0)
        } finally { await restarted.ctx.fiber.dispose(); writeFileSync(ledgerPath, beforeLedger) }
        expect(readFileSync(join(evolutionRoot, 'ledger.jsonl'), 'utf8')).toBe(beforeLedger)
      }
    }
    if (scenario === 'rejected' || scenario === 'unknown') await expect(studyEvidence.recoverFileGuidanceStudyReviewPacket(harness.ctx, study)).rejects.toThrow('source-unavailable')
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
          const record = event.record
          const target = event.record.target
          expect(() => replay.validate({ ...record, target: { ...target, requestDigest: sha256('unrelated exploration intent') } })).toThrow(/exploration target/)
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
        if (scenario === 'feedback-clue-recover-projection-drift') {
          const proofId = restarted.ctx.tianwenEvolution.listConversationFeedbackAssessments()[0]!.result!.proof!.sessionId
          const inspect = restarted.ctx.sessionPersistence.inspect.bind(restarted.ctx.sessionPersistence)
          vi.spyOn(restarted.ctx.sessionPersistence, 'inspect').mockImplementation(async id => {
            const saved = await inspect(id)
            return String(id) === proofId ? { ...saved, events: saved.events.map(event => event.type === 'user/message' ? { ...event, data: { ...event.data, content: [{ type: 'text', text: 'substituted assessment native material' }] } } : event) } : saved
          })
        }
        await restarted.ctx.plugin(TianwenConversationGuidanceLoopService, loopConfig)
        const resumed = await restarted.ctx.agents.resume({ resumeSessionId: SessionId('natural-files'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
        await restarted.ctx.tianwenConversationGuidanceLoop.whenIdle()
        if (scenario === 'result-check-rejected-recover' || scenario === 'recover-incomplete' || scenario === 'recover-changed-native' || scenario === 'feedback-clue-recover-substituted' || scenario === 'feedback-clue-recover-projection-drift') expect(restarted.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.activation).toBeUndefined()
        else expect(restarted.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!.activation).toBeDefined()
        expect(restarted.adapter.requests).toHaveLength(0)
        if (studyCheck) { expect(preparedCases).toBe(5); expect(evaluatedArms).toBe(10); if (preDesign) expect(inputPreparations).toBe(1) }
        await restarted.ctx.tianwenConversationGuidanceLoop.schedule(resumed.agent)
        expect(new EvolutionLedger(evolutionRoot).listConversationGuidanceStudies()).toHaveLength(1)
        await resumed.dispose()
      } finally { await restarted.ctx.fiber.dispose() }
    }
  } finally { if (!stopped) { await handle.dispose(); await harness.ctx.fiber.dispose() }; rmSync(root, { recursive: true, force: true }) }
}, scenario.startsWith('recover-source-explored') ? 30_000 : undefined)
