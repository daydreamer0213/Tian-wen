import assert from 'node:assert/strict'
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session'
import { parseConversationFileMaterial, parseConversationQualityContract, sha256, type ConversationExternalCheckOutcome } from '@tianwen/evolution'
import type { ConversationAnswerStudyMaterial, ConversationAnswerStudyResultCheck } from './conversation-study-result-check.js'
import type { GoalTaskAcceptanceCheck, GoalTaskAcceptancePreparation } from './goal-task-acceptance.js'
import type { NativeGoalTaskStudyMaterial } from './goal-task-research-source.js'
import { parseNativeGoalStudyInput } from './goal-task-study-input.js'
import { parseGoalTaskMethodScope } from './goal-task-method.js'
import { readConversationFile } from './conversation-file-material.js'
import { projectNativeFileActions } from './conversation-task-material.js'
import { canonicalJsonResult, isolatedPythonPolicy, prepareIsolatedPythonCli, type IsolatedPythonCliConfig } from './isolated-python-cli.js'

const checkerPath = fileURLToPath(import.meta.url), checkerSourceDigest = sha256(readFileSync(checkerPath))
const checkerId = 'tianwen.isolated-python-answer.v1'
/** Change only Planner requirements; serialize exactly like original source recovery. */
function bindNativeTaskMaterial(template: NativeGoalTaskStudyMaterial, delegatedTask: string, requiredCondition: string): NativeGoalTaskStudyMaterial {
  const original = parseNativeGoalStudyInput(template.prompt)
  assert(typeof delegatedTask === 'string' && delegatedTask.trim() !== '')
  return { ...structuredClone(template), prompt: JSON.stringify({ protocol: original.protocol, originalCommand: original.originalCommand,
    goal: { objective: original.goal.objective, context: original.goal.context, successCriteria: original.goal.successCriteria }, delegatedTask,
    ...(original.permissionMode === undefined ? {} : { permissionMode: original.permissionMode }) }),
    criteria: [delegatedTask, requiredCondition, ...(original.goal.successCriteria === null ? [] : [original.goal.successCriteria])] }
}
export interface GoalTaskIsolatedPythonAnswerCheckConfig {
  readonly cwd: string
  readonly family: import('@tianwen/evolution').ConversationFamily
  readonly material: NativeGoalTaskStudyMaterial
  readonly modelConfigDigest: ReturnType<typeof sha256>
  readonly requiredCondition: string
  readonly verifierSource: string
  readonly isolated: IsolatedPythonCliConfig
  /** Explicit Goal scope template; bind actual original Task before its first answer. Default is exact Task. */
  readonly bindActualTask?: true
}
/** Original Goal interface; the same frozen rule checks ordinary and research answers. */
export function createGoalTaskIsolatedPythonAnswerCheck(raw: GoalTaskIsolatedPythonAnswerCheckConfig): GoalTaskAcceptanceCheck {
  const config = structuredClone(raw), material = config.material, original = parseNativeGoalStudyInput(material.prompt)
  assert(config.bindActualTask === undefined || config.bindActualTask === true)
  const pathKey = (value: string) => { const path = resolve(value).replaceAll('\\', '/'); return process.platform === 'win32' ? path.toLowerCase() : path }
  assert(isAbsolute(config.cwd) && !lstatSync(config.cwd).isSymbolicLink() && lstatSync(config.cwd).isDirectory())
  assert.equal(pathKey(realpathSync(config.cwd)), pathKey(config.cwd))
  assert(material.sourceKind === 'native-goal-task' && material.qualityContract !== undefined)
  parseConversationQualityContract(material.qualityContract)
  assert(original.originalCommand.trim() === original.goal.objective && original.goal.objective.trim() !== '')
  assert.deepEqual(material.criteria, [original.delegatedTask, config.requiredCondition, ...(original.goal.successCriteria === null ? [] : [original.goal.successCriteria])])
  if (material.files !== undefined) assert.equal(pathKey(material.files.cwd), pathKey(config.cwd))
  const scope = parseGoalTaskMethodScope(material.files === undefined ? { family: config.family, evaluationMode: 'text' }
    : { family: config.family, evaluationMode: 'local-files', fileOutputKind: 'chat' })
  const caseId = 'native-goal-task', producerFor = (material: NativeGoalTaskStudyMaterial) => createConversationStudyIsolatedPythonAnswerCheck({
    modelConfigDigest: config.modelConfigDigest, isolated: config.isolated,
    cases: [{ caseId, material, requiredCondition: config.requiredCondition, verifierSource: config.verifierSource }],
  })
  const producer = producerFor(material)
  const applicable = (input: Omit<GoalTaskAcceptancePreparation, 'modelConfigDigest'>) => {
    input.signal.throwIfAborted()
    const { goal, task, attempt, source } = input
    return pathKey(input.cwd) === pathKey(config.cwd) && pathKey(goal.workspaceRoot) === pathKey(config.cwd)
      && goal.objective === original.goal.objective && goal.context === original.goal.context && goal.successCriteria === original.goal.successCriteria
      && source.type === 'command/run' && source.data.name === 'goal' && source.data.source.kind === 'user'
      && source.data.args === original.originalCommand && goal.origin !== undefined
      && goal.origin.commandId === source.data.commandId && goal.origin.commandSeq === source.seq && goal.origin.commandDigest === sha256(source)
      && (config.bindActualTask === true ? typeof task.objective === 'string' && task.objective.trim() !== '' : task.objective === original.delegatedTask)
      && goal.tasks.some(item => item.id === task.id && sha256(item) === sha256(task))
      && task.execution !== null && task.execution.sessionId === attempt.childSessionId
      && attempt.status === 'running' && attempt.parentSessionId === goal.planner.sessionId && attempt.permissionMode === original.permissionMode
  }
  return {
    async methodScope(input) { return applicable(input) ? structuredClone(scope) : undefined },
    async prepare(input) {
      input.signal.throwIfAborted()
      try {
        if (!applicable(input) || input.modelConfigDigest !== config.modelConfigDigest) return undefined
        const { goal, task, attempt, source } = structuredClone({ goal: input.goal, task: input.task, attempt: input.attempt, source: input.source })
        const actualMaterial = config.bindActualTask === true ? bindNativeTaskMaterial(material, task.objective, config.requiredCondition) : material
        const actualProducer = config.bindActualTask === true ? producerFor(actualMaterial) : producer
        const snapshot = { goal: { id: goal.id, objective: goal.objective, context: goal.context, successCriteria: goal.successCriteria,
          workspaceRoot: goal.workspaceRoot, origin: goal.origin! }, task,
          ...(attempt.permissionMode === undefined ? {} : { permissionMode: attempt.permissionMode }) }
        const files = material.files, contentReview = { qualityContract: material.qualityContract, ...(files === undefined ? {} : { files }) }
        const capturedFiles = async () => {
          const current = files === undefined ? [] : await Promise.all(files.entries.map(entry => readConversationFile(config.cwd, entry.path)))
          assert.equal(sha256(current), sha256(files?.entries ?? [])); return current
        }
        await capturedFiles(); input.signal.throwIfAborted()
        const prepared = await actualProducer.prepare({ caseId, material: actualMaterial, modelConfigDigest: config.modelConfigDigest, signal: input.signal })
        if (prepared === undefined) return undefined
        return { checkerId: prepared.checkerId, checkerDigest: prepared.checkerDigest, contractDigest: prepared.contractDigest,
          inputsDigest: prepared.inputsDigest, requiredCondition: prepared.requiredCondition, waitsForCancellationCleanup: true,
          contentReview: structuredClone(contentReview), async evaluate(candidate) {
            candidate.signal.throwIfAborted()
            try {
              const b = candidate.preparation, events = structuredClone(candidate.events)
              assert.equal(sha256(candidate.source), sha256(source)); assert.equal(sha256(b.requirementsSnapshot), sha256(snapshot))
              assert.equal(b.taskDigest, sha256(task)); assert.equal(b.modelConfigDigest, config.modelConfigDigest)
              assert(b.epoch === attempt.epoch && b.parentSessionId === attempt.parentSessionId && b.childSessionId === attempt.childSessionId
                && b.nativeGoalId === task.execution!.goalId && b.permissionFingerprint === attempt.permissionFingerprint)
              assert(b.checkerId === prepared.checkerId && b.checkerDigest === prepared.checkerDigest && b.contractDigest === prepared.contractDigest
                && b.inputsDigest === prepared.inputsDigest && b.requiredCondition === prepared.requiredCondition)
              assert.equal(sha256(b.contentReview), sha256({ protocol: 'tianwen.goal-task-content-review.v1', ...contentReview,
                ...(b.contentReview?.deliveryPolicy === 'native-terminal.v1' ? { deliveryPolicy: 'native-terminal.v1' } : {}) }))
              assert.equal(sha256(events.filter(event => event.seq <= b.preparedSeq)), b.prefixDigest)
              const header = events.find(event => event.seq === b.headerSeq), end = events.at(-1)
              assert(header?.type === 'request/header' && sha256(header.data.header.config) === b.modelConfigDigest)
              assert(end?.type === 'turn/end' && end.seq > b.preparedSeq && end.data.reason.kind === 'completed')
              assert(events.every(event => event.type !== 'request/header' || sha256(event.data.header.config) === b.modelConfigDigest))
              if (files === undefined) assert(!events.some(event => event.type === 'tool/call' && ['read', 'write', 'edit'].includes(event.data.name)))
              else if (events.some(event => event.type === 'tool/call')) {
                const execution = projectNativeFileActions(events, end.seq, files)
                assert(!execution.actions.some(action => action.tool === 'write' || action.tool === 'edit'))
              }
              // Match native subagent delivery: intermediate tool-step replies are not the terminal answer.
              const terminal = events.findLast(event => event.seq > b.preparedSeq && event.type === 'assistant/message'
                && isAppendSurfaceEvent(event) && event.data.message.content.length > 0)
              assert(terminal?.type === 'assistant/message')
              const answer = terminal.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
              const currentFiles = await capturedFiles(); candidate.signal.throwIfAborted()
              const outcome = await prepared.evaluate({ material: structuredClone(actualMaterial), answer, files: currentFiles, signal: candidate.signal })
              await capturedFiles(); candidate.signal.throwIfAborted()
              assert.equal(sha256(candidate.events), sha256(events))
              return outcome
            } catch { candidate.signal.throwIfAborted(); return { status: 'unverifiable' as const, detail: 'Original Goal answer contract, native evidence or unchanged file graph unavailable.' } }
          } }
      } catch { input.signal.throwIfAborted(); return undefined }
    },
  }
}
export interface ConversationIsolatedPythonAnswerCase {
  readonly caseId: string
  /** Complete original case contract, independently known before the answer. */
  readonly material: ConversationAnswerStudyMaterial
  readonly requiredCondition: string
  /** Trusted host code, never candidate-generated. Only a JSON boolean is a valid result. */
  readonly verifierSource: string
}
export interface ConversationIsolatedPythonAnswerCheckConfig {
  readonly modelConfigDigest: ReturnType<typeof sha256>
  readonly cases: readonly ConversationIsolatedPythonAnswerCase[]
  readonly isolated: IsolatedPythonCliConfig
  /** Explicit full five-role cohort; supply fixed cases, never generate them from model answers. */
  readonly provideIndependentCases?: true
  /** Bind recovered native original Tasks once; Goal scope and independent cases stay host-frozen. */
  readonly bindActualGoalTasks?: true
}
const packet = (material: ConversationAnswerStudyMaterial, answer: string, files: unknown) =>
  JSON.stringify({ schemaVersion: 'tianwen.answer-check.v1', material, answer, files })
function saveExact(path: string, text: string): void {
  if (existsSync(path)) assert.equal(readFileSync(path, 'utf8'), text)
  else writeFileSync(path, text, { flag: 'wx' })
}
/** Produces results only for explicit frozen host contracts; does not design cases or certify an arbitrary verifier. */
export function createConversationStudyIsolatedPythonAnswerCheck(raw: ConversationIsolatedPythonAnswerCheckConfig): ConversationAnswerStudyResultCheck {
  const config = structuredClone(raw)
  assert(config.bindActualGoalTasks === undefined || config.bindActualGoalTasks === true)
  assert(config.bindActualGoalTasks !== true || config.provideIndependentCases === true)
  assert.match(config.modelConfigDigest, /^sha256:[a-f0-9]{64}$/u)
  assert(config.cases.length > 0 && config.cases.length <= 5)
  const definitions = new Map(config.cases.map(entry => {
    assert(typeof entry.caseId === 'string' && entry.caseId.trim() !== '' && Buffer.byteLength(entry.caseId) <= 512 && !entry.caseId.includes('\0'))
    assert(typeof entry.requiredCondition === 'string' && entry.requiredCondition.trim() !== '' && Buffer.byteLength(entry.requiredCondition) <= 4096 && !entry.requiredCondition.includes('\0'))
    assert(typeof entry.verifierSource === 'string' && entry.verifierSource.trim() !== '' && Buffer.byteLength(entry.verifierSource) <= isolatedPythonPolicy.sourceBytes)
    const material = entry.material
    assert(material && Array.isArray(material.criteria) && material.criteria.length > 0 && material.criteria.every(value => typeof value === 'string' && value.trim() !== ''))
    assert(['answer', 'guidance', 'role', 'verdict'].every(key => !Object.hasOwn(material, key)))
    if ('request' in material) assert(Array.isArray(material.request) && material.request.length > 0 && typeof material.objective === 'string' && material.objective.trim() !== '')
    else assert(typeof material.prompt === 'string' && material.prompt.trim() !== '')
    if (material.qualityContract !== undefined) parseConversationQualityContract(material.qualityContract)
    if (material.files !== undefined) {
      const files = parseConversationFileMaterial(material.files)
      assert(files.outputKind === 'chat' && files.outputPaths.length === 0)
    }
    assert(Buffer.byteLength(packet(material, '', material.files?.entries ?? [])) < isolatedPythonPolicy.ioBytes)
    return [entry.caseId, { ...entry, materialDigest: sha256(material) }] as const
  }))
  assert.equal(definitions.size, config.cases.length)
  const roles = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
  let boundDefinitions = definitions, boundOriginalsDigest: ReturnType<typeof sha256> | undefined
  let prepareIndependentCases: ConversationAnswerStudyResultCheck['prepareIndependentCases']
  if (config.provideIndependentCases === true) {
    assert.deepEqual([...definitions.keys()].sort(), [...roles].sort())
    const first = definitions.get('source1')!.material, qualityDigest = sha256(first.qualityContract)
    assert(first.qualityContract !== undefined)
    assert(roles.slice(0, 3).every(id => {
      const material = definitions.get(id)!.material
      return ('request' in material || 'sourceKind' in material && material.sourceKind === 'native-goal-task')
        && ('sourceKind' in material) === ('sourceKind' in first)
    }))
    assert(roles.slice(3).every(id => {
      const material = definitions.get(id)!.material
      return 'prompt' in material && !('sourceKind' in material) && !('request' in material)
    }))
    assert(roles.every(id => {
      const material = definitions.get(id)!.material
      return material.qualityContract !== undefined && sha256(material.qualityContract) === qualityDigest
        && (material.files === undefined) === (first.files === undefined) && material.files?.cwd === first.files?.cwd
    }))
    if (config.bindActualGoalTasks === true) for (const id of roles.slice(0, 3)) {
      const entry = definitions.get(id)!, material = entry.material
      assert('sourceKind' in material && material.sourceKind === 'native-goal-task')
      const original = parseNativeGoalStudyInput(material.prompt)
      assert(original.originalCommand.trim() === original.goal.objective && original.goal.objective.trim() !== '')
      assert.deepEqual(material.criteria, [original.delegatedTask, entry.requiredCondition, ...(original.goal.successCriteria === null ? [] : [original.goal.successCriteria])])
    }
    prepareIndependentCases = async input => {
      input.signal.throwIfAborted()
      if (input.modelConfigDigest !== config.modelConfigDigest || input.sources.length !== 2 || sha256(input.qualityContract) !== qualityDigest
        || input.cwd !== first.files?.cwd) return undefined
      const originals = [...input.sources, input.counterexample]
      if (config.bindActualGoalTasks === true) {
        try {
          const bindings = originals.map((material, index) => {
            const id = roles[index]!, template = definitions.get(id)!
            assert('sourceKind' in material && material.sourceKind === 'native-goal-task')
            const actual = parseNativeGoalStudyInput(material.prompt)
            const bound = bindNativeTaskMaterial(template.material as NativeGoalTaskStudyMaterial, actual.delegatedTask, template.requiredCondition)
            assert.equal(sha256(material), sha256(bound))
            assert(Buffer.byteLength(packet(bound, '', bound.files?.entries ?? [])) < isolatedPythonPolicy.ioBytes)
            return [id, { ...template, material: bound, materialDigest: sha256(bound) }] as const
          })
          const digest = sha256(originals)
          if (boundOriginalsDigest !== undefined && boundOriginalsDigest !== digest) return undefined
          input.signal.throwIfAborted()
          if (boundOriginalsDigest === undefined) {
            boundDefinitions = new Map(definitions)
            for (const [id, entry] of bindings) boundDefinitions.set(id, entry)
            boundOriginalsDigest = digest
          }
        } catch { input.signal.throwIfAborted(); return undefined }
      } else if (originals.some((material, index) => sha256(material) !== definitions.get(roles[index]!)!.materialDigest)) return undefined
      const independent = (id: 'adjacent' | 'holdout') => {
        const material = definitions.get(id)!.material
        assert('prompt' in material)
        return { prompt: material.prompt, criteria: [...material.criteria], ...(material.files === undefined ? {} : {
          files: { entries: structuredClone(material.files.entries), outputPaths: [...material.files.outputPaths] },
        }) }
      }
      return { adjacent: independent('adjacent'), holdout: independent('holdout') }
    }
  }
  return { ...(prepareIndependentCases === undefined ? {} : { prepareIndependentCases }), async prepare(input) {
    input.signal.throwIfAborted()
    try {
      if (config.bindActualGoalTasks === true && boundOriginalsDigest === undefined) return undefined
      const entry = boundDefinitions.get(input.caseId)
      if (entry === undefined || input.modelConfigDigest !== config.modelConfigDigest || sha256(input.material) !== entry.materialDigest) return undefined
      assert.equal(sha256(readFileSync(checkerPath)), checkerSourceDigest)
      const runner = await prepareIsolatedPythonCli(config.isolated, input.signal)
      input.signal.throwIfAborted()
      const contract = JSON.stringify({ checkerId, checkerSourceDigest, executorDigest: runner.digest,
        modelConfigDigest: config.modelConfigDigest, ...entry })
      const contractDigest = sha256(contract), root = resolve(config.isolated.workRoot), manifestPath = resolve(root, `contract-${contractDigest.slice(7)}.json`)
      saveExact(manifestPath, contract)
      const unchanged = () => {
        assert.equal(sha256(readFileSync(checkerPath)), checkerSourceDigest)
        assert.equal(readFileSync(manifestPath, 'utf8'), contract)
      }
      return { checkerId, checkerDigest: sha256({ checkerSourceDigest, executorDigest: runner.digest, verifierDigest: sha256(entry.verifierSource) }),
        contractDigest, inputsDigest: entry.materialDigest, requiredCondition: entry.requiredCondition, waitsForCancellationCleanup: true,
        async evaluate(candidate) {
          candidate.signal.throwIfAborted()
          try {
            unchanged()
            const material = structuredClone(candidate.material), files = structuredClone(candidate.files), answer = candidate.answer
            assert.equal(sha256(material), entry.materialDigest)
            assert.equal(sha256(files), sha256(entry.material.files?.entries ?? []))
            assert(typeof answer === 'string')
            const inputPacket = packet(material, answer, files)
            assert(Buffer.byteLength(inputPacket) <= isolatedPythonPolicy.ioBytes)
            // Always execute the immutable host rule. The candidate answer is stdin data only.
            const result = await runner.run(entry.verifierSource, inputPacket, candidate.signal)
            candidate.signal.throwIfAborted(); unchanged()
            let status: ConversationExternalCheckOutcome['status'] = 'unverifiable'
            if (result.status === 'completed' && result.exitCode === 0 && result.stderr === '') {
              try { const value = canonicalJsonResult(result.stdout)
                if (value === 'true' || value === 'false') status = value === 'true' ? 'verified' : 'rejected'
              } catch { /* An invalid verifier result is not an original-task failure. */ }
            }
            const receipt = JSON.stringify({ contractDigest, packetDigest: sha256(inputPacket), status,
              ...(result.receiptDigest === undefined ? {} : { receiptDigest: result.receiptDigest }) })
            const receiptDigest = sha256(receipt)
            saveExact(resolve(root, `result-${receiptDigest.slice(7)}.json`), receipt)
            candidate.signal.throwIfAborted()
            return { status, detail: `Frozen host answer contract only; verifier execution ${receiptDigest}.`,
              ...(status === 'rejected' ? { failedRequiredConditionDigest: sha256(entry.requiredCondition) } : {}) }
          } catch { candidate.signal.throwIfAborted(); return { status: 'unverifiable', detail: 'Frozen answer contract, bounded verifier or evidence unavailable.' } }
        },
      }
    } catch { input.signal.throwIfAborted(); return undefined }
  } }
}
