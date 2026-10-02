import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conversationExternalInputsDigest, parseConversationFileEntries, parseConversationFileMaterial, parseConversationQualityContract, sha256, supportsConversationCodeCheck,
  type ConversationExternalCheckOutcome, type ConversationFileEntry } from '@tianwen/evolution'
import { readConversationFile } from './conversation-file-material.js'
import type { ConversationExternalCodeCheck, ConversationExternalCodePreparation, ConversationExternalCodeCandidate, PreparedConversationExternalCodeCheck } from './conversation-external-check.js'
import type { ConversationStudyResultCheck, ConversationStudyResultMaterial } from './conversation-study-result-check.js'
import { canonicalJsonResult, isolatedPythonPolicy, prepareIsolatedPythonCli, type IsolatedPythonCliConfig } from './isolated-python-cli.js'

import { prepareIsolatedNodeCli } from './isolated-node-cli.js'
import { prepareIsolatedNodeProject } from './isolated-node-project.js'
const checkerPath = fileURLToPath(import.meta.url), checkerSourceDigest = sha256(readFileSync(checkerPath).toString('utf8'))
const pathKey = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
const requestText = (request: ConversationExternalCodePreparation['request']) => request.flatMap(message =>
  message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
export interface ConversationIsolatedPythonCheckConfig {
  readonly cwd: string
  readonly requestText: string
  readonly targetPath: string
  readonly referencePaths?: readonly string[]
  /** Host-owned functional expectations frozen before any candidate; never model-generated assertions. */
  readonly cases: readonly { readonly id: string; readonly input: string; readonly expectedJson: string; readonly exitCode: number }[]
  readonly isolated: IsolatedPythonCliConfig
  /** Opt in only for a mandatory condition of the original task. Absent means diagnostic only. */
  readonly requiredCondition?: string
}
interface FrozenFunctionalCheck {
  readonly checkerId: string
  readonly checkerDigest: ReturnType<typeof sha256>
  readonly contractDigest: ReturnType<typeof sha256>
  readonly inputs: readonly ConversationFileEntry[]
  readonly requiredCondition?: string
  readonly waitsForCancellationCleanup: true
  readonly evaluate: (candidate: Pick<ConversationExternalCodeCandidate, 'inputs' | 'outputs' | 'outputPaths' | 'signal'>) => Promise<ConversationExternalCheckOutcome>
}

type CheckEngine = 'python' | 'node' | 'node-project'
type InternalConfig = ConversationIsolatedPythonCheckConfig & { readonly outputPaths?: readonly string[] }
function createPreparation(raw: InternalConfig, engine: CheckEngine) {
  const checkerId = engine === 'python' ? 'conversation-isolated-python-json-cli.v1' : engine === 'node' ? 'conversation-isolated-node-json-cli.v1' : 'conversation-isolated-node-project-json-cli.v1'
  const config = structuredClone(raw), cwd = resolve(config.cwd), references = [...(config.referencePaths ?? [])]
  const targets = engine === 'node-project' ? [...(config.outputPaths ?? [])] : [config.targetPath]
  assert(targets.length > 0)
  assert(typeof config.requestText === 'string' && config.requestText.trim() !== '')
  assert(engine === 'python' ? config.targetPath.endsWith('.py') : /\.(?:m?js|m?ts)$/u.test(config.targetPath))
  const names = [...targets, ...references]
  parseConversationFileEntries(names.map(path => ({ path, content: null })))
  assert(names.includes(config.targetPath))
  assert(config.requiredCondition === undefined || typeof config.requiredCondition === 'string' && config.requiredCondition.trim() !== '')
  assert(Array.isArray(config.cases) && config.cases.length > 0 && config.cases.length <= 64)
  const ids = new Set<string>()
  const cases = config.cases.map(value => {
    assert(typeof value.id === 'string' && value.id.trim() !== '' && value.id.length <= 128 && !ids.has(value.id)); ids.add(value.id)
    assert(typeof value.input === 'string' && Buffer.byteLength(value.input) <= isolatedPythonPolicy.ioBytes)
    assert(typeof value.expectedJson === 'string'); assert(Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255)
    return { ...value, expectedCanonical: canonicalJsonResult(value.expectedJson) }
  })
  return { cwd, requestText: config.requestText, targetPath: config.targetPath, targets, references,
    async prepare(signal: AbortSignal, saved?: readonly ConversationFileEntry[]): Promise<FrozenFunctionalCheck | undefined> {
      signal.throwIfAborted()
      try {
        assert.equal(sha256(readFileSync(checkerPath).toString('utf8')), checkerSourceDigest)
        const inputs = saved === undefined ? await Promise.all(names.map(path => readConversationFile(cwd, path))) : parseConversationFileEntries(structuredClone(saved))
        assert(names.length === inputs.length && names.every(path => inputs.some(entry => entry.path === path)))
        assert(references.every(path => inputs.find(entry => entry.path === path)?.content != null))
        const inputDigest = conversationExternalInputsDigest(inputs)
        const projectRunner = engine === 'node-project' ? await prepareIsolatedNodeProject(config.isolated, signal) : undefined
        const runner = projectRunner ?? (engine === 'python' ? await prepareIsolatedPythonCli(config.isolated, signal) : await prepareIsolatedNodeCli(config.isolated, signal, config.targetPath.endsWith('ts') ? 'typescript' : 'javascript'))
        signal.throwIfAborted()
        const contract = { checkerId, checkerSourceDigest, executorDigest: runner.digest, cwd, requestText: config.requestText,
          targetPath: config.targetPath, referencePaths: references, inputsDigest: inputDigest, cases: config.cases,
          ...(engine === 'node-project' ? { outputPaths: targets } : {}),
          ...(config.requiredCondition === undefined ? {} : { requiredCondition: config.requiredCondition }) }
        const contractDigest = sha256(contract), checkerDigest = sha256({ checkerSourceDigest, executorDigest: runner.digest })
        const root = resolve(config.isolated.workRoot); mkdirSync(root, { recursive: true })
        const manifestPath = resolve(root, `contract-${contractDigest.slice(7)}.json`), manifest = JSON.stringify(contract)
        if (existsSync(manifestPath)) assert.equal(readFileSync(manifestPath).toString('utf8'), manifest)
        else writeFileSync(manifestPath, manifest, { flag: 'wx' })
        return { checkerId, checkerDigest, contractDigest, inputs: structuredClone(inputs), waitsForCancellationCleanup: true,
          ...(config.requiredCondition === undefined ? {} : { requiredCondition: config.requiredCondition }),
          async evaluate(candidate) {
            candidate.signal.throwIfAborted()
            try {
              assert.equal(sha256(readFileSync(checkerPath).toString('utf8')), checkerSourceDigest)
              assert.equal(readFileSync(manifestPath).toString('utf8'), manifest)
              const values = structuredClone({ inputs: candidate.inputs, outputs: candidate.outputs, paths: candidate.outputPaths })
              assert.equal(conversationExternalInputsDigest(parseConversationFileEntries(values.inputs)), inputDigest)
              // Native multi-file capture order follows read completion, not the
              // host's declaration order. Compare exact permissions without
              // deduplication; saved contracts and single-file modes stay exact.
              assert.deepEqual(engine === 'node-project' ? [...values.paths].sort() : values.paths,
                engine === 'node-project' ? [...targets].sort() : targets)
              const outputs = parseConversationFileEntries(values.outputs)
              assert(outputs.length === names.length && names.every(path => outputs.some(entry => entry.path === path)))
              assert(references.every(path => outputs.find(entry => entry.path === path)?.content === inputs.find(entry => entry.path === path)?.content))
              const source = outputs.find(entry => entry.path === config.targetPath)?.content
              assert(typeof source === 'string')
              if (engine === 'node-project') assert(targets.every(path => outputs.find(entry => entry.path === path)?.content != null))
              else assert(Buffer.byteLength(source) <= isolatedPythonPolicy.sourceBytes)
              const receipts: { id: string; receiptDigest?: string; status: string }[] = []
              let status: ConversationExternalCheckOutcome['status'] = 'verified', failedCase: string | undefined
              for (const test of cases) {
                const result = projectRunner === undefined
                  ? await (runner as Awaited<ReturnType<typeof prepareIsolatedPythonCli>>).run(source, test.input, candidate.signal)
                  : await projectRunner.run({ files: outputs, entryPath: config.targetPath, input: test.input }, candidate.signal)
                candidate.signal.throwIfAborted()
                if (result.status !== 'completed') { receipts.push({ id: test.id, status: 'unverifiable',
                  ...(!('receiptDigest' in result) || result.receiptDigest === undefined ? {} : { receiptDigest: result.receiptDigest }) }); status = 'unverifiable'; break }
                let matched = result.exitCode === test.exitCode && result.stderr === ''
                try { matched = matched && canonicalJsonResult(result.stdout) === test.expectedCanonical } catch { matched = false }
                receipts.push({ id: test.id, receiptDigest: result.receiptDigest, status: matched ? 'verified' : 'rejected' })
                if (!matched) { status = 'rejected'; failedCase = test.id; break }
              }
              const receipt = JSON.stringify({ contractDigest, inputDigest, outputDigest: conversationExternalInputsDigest(outputs),
                sourceDigest: sha256(source), status, failedCase, cases: receipts })
              const receiptDigest = sha256(receipt), receiptPath = resolve(root, `result-${receiptDigest.slice(7)}.json`)
              if (existsSync(receiptPath)) assert.equal(readFileSync(receiptPath).toString('utf8'), receipt)
              else writeFileSync(receiptPath, receipt, { flag: 'wx' })
              candidate.signal.throwIfAborted()
              return { status, detail: `Frozen isolated ${engine} JSON CLI functional cases only; not whole-task quality. ${receipts.length}/${cases.length} case(s); ${receiptDigest}.`,
                ...(status !== 'rejected' || config.requiredCondition === undefined ? {} : { failedRequiredConditionDigest: sha256(config.requiredCondition) }) }
            } catch { candidate.signal.throwIfAborted(); return { status: 'unverifiable', detail: 'Frozen functional check binding, environment or evidence unavailable.' } }
          },
        }
      } catch { signal.throwIfAborted(); return undefined }
    },
  }
}

/** Explicit host opt-in; no default enablement and no new model execution tool. */
export function createConversationIsolatedPythonCheck(config: ConversationIsolatedPythonCheckConfig): ConversationExternalCodeCheck {
  return createConversationIsolatedJsonCheck(config, 'python')
}
export function createConversationIsolatedJsonCheck(config: InternalConfig, engine: CheckEngine): ConversationExternalCodeCheck {
  const core = createPreparation(config, engine)
  return { async prepare(material) {
    material.signal.throwIfAborted()
    if (pathKey(material.cwd) !== pathKey(core.cwd) || requestText(material.request) !== core.requestText
      || !supportsConversationCodeCheck(material.task.admission?.decision)) return undefined
    const binding = sha256({ request: material.request, context: material.context }), prepared = await core.prepare(material.signal)
    if (prepared === undefined) return undefined
    return { ...prepared, contractDigest: sha256({ functionalContract: prepared.contractDigest, materialDigest: binding }),
      async evaluate(candidate) {
        candidate.signal.throwIfAborted()
        try { if (sha256({ request: candidate.request, context: candidate.context }) !== binding) throw new Error('binding mismatch') }
        catch { return { status: 'unverifiable', detail: 'Frozen original request or context mismatch.' } }
        return prepared.evaluate(candidate)
      },
    } satisfies PreparedConversationExternalCodeCheck
  } }
}
const body = (material: ConversationStudyResultMaterial): ConversationStudyResultMaterial => ({
  ...('request' in material ? { request: material.request, context: material.context, objective: material.objective,
    ...(material.feedbackStandard === undefined ? {} : { feedbackStandard: material.feedbackStandard }) } : { prompt: material.prompt }),
  criteria: material.criteria, ...(material.qualityContract === undefined ? {} : { qualityContract: material.qualityContract }), files: material.files,
})
/** Saved study material only, without reading today's target files or fabricating an ordinary task. */
type StudyConfig = ConversationIsolatedPythonCheckConfig & { readonly requiredCondition: string; readonly criteria: readonly string[] }
type InternalStudyConfig = InternalConfig & { readonly requiredCondition: string; readonly criteria: readonly string[] }
export function createConversationStudyIsolatedPythonCheck(config: StudyConfig): ConversationStudyResultCheck {
  return createConversationStudyIsolatedJsonCheck(config, 'python')
}
export function createConversationStudyIsolatedJsonCheck(config: InternalStudyConfig, engine: CheckEngine): ConversationStudyResultCheck {
  assert(Array.isArray(config.criteria) && config.criteria.length > 0 && config.criteria.every(value => typeof value === 'string' && value.trim() !== ''))
  const criteriaDigest = sha256(config.criteria), core = createPreparation(config, engine)
  return { async prepare(material) {
    material.signal.throwIfAborted()
    try {
      const saved = structuredClone(body(material)), files = parseConversationFileMaterial(saved.files)
      if (files.outputKind !== 'files' || pathKey(files.cwd) !== pathKey(core.cwd) || sha256(saved.criteria) !== criteriaDigest
        || ('request' in saved ? requestText(saved.request) : saved.prompt) !== core.requestText
        || sha256(files.outputPaths) !== sha256(core.targets)) return undefined
      const materialDigest = sha256(saved), prepared = await core.prepare(material.signal, files.entries)
      if (prepared?.requiredCondition === undefined) return undefined
      return { ...prepared, requiredCondition: prepared.requiredCondition,
        contractDigest: sha256({ functionalContract: prepared.contractDigest, materialDigest, caseId: material.caseId, modelConfigDigest: material.modelConfigDigest }),
        async evaluate(candidate) {
          candidate.signal.throwIfAborted()
          try { if (sha256(body(candidate)) !== materialDigest) throw new Error('binding mismatch') }
          catch { return { status: 'unverifiable', detail: 'Frozen complete study material mismatch.' } }
          return prepared.evaluate(candidate)
        },
      }
    } catch { material.signal.throwIfAborted(); return undefined }
  } }
}

type FunctionalStudyRole = 'source1' | 'source2' | 'counterexample' | 'adjacent' | 'holdout'
export interface ConversationIsolatedPythonStudyCase {
  readonly material: ConversationStudyResultMaterial
  readonly cases: ConversationIsolatedPythonCheckConfig['cases']
  readonly isolated: IsolatedPythonCliConfig
  readonly requiredCondition: string
}

/** Closed host cohort, fixed before case design; not a task generator or source-eligibility decision. */
type CohortConfig = { readonly modelConfigDigest: ReturnType<typeof sha256>; readonly cases: Readonly<Record<FunctionalStudyRole, ConversationIsolatedPythonStudyCase>> }
type InternalCohortConfig = Omit<CohortConfig, 'cases'> & { readonly cases: Readonly<Record<FunctionalStudyRole, ConversationIsolatedPythonStudyCase & { readonly entryPath?: string }>> }
export function createConversationStudyIsolatedPythonCohortCheck(raw: CohortConfig): ConversationStudyResultCheck {
  return createConversationStudyIsolatedJsonCohortCheck(raw, 'python')
}
export function createConversationStudyIsolatedJsonCohortCheck(raw: InternalCohortConfig, engine: CheckEngine): ConversationStudyResultCheck {
  const config = structuredClone(raw), roles = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
  assert.match(config.modelConfigDigest, /^sha256:[a-f0-9]{64}$/u)
  assert.deepEqual(Object.keys(config.cases).sort(), [...roles].sort())
  const definitions = new Map(roles.map((id, index) => {
    const entry = config.cases[id], material = body(entry.material), files = parseConversationFileMaterial(material.files)
    assert(files.outputKind === 'files' && (engine === 'node-project' ? files.outputPaths.length > 0 : files.outputPaths.length === 1))
    assert(('request' in material) === (index < 3))
    assert(material.qualityContract !== undefined)
    parseConversationQualityContract(material.qualityContract)
    const targetPath = engine === 'node-project' ? entry.entryPath! : files.outputPaths[0]!
    assert(typeof targetPath === 'string')
    const referencePaths = files.entries.filter(file => !files.outputPaths.includes(file.path)).map(file => file.path)
    const producer = createConversationStudyIsolatedJsonCheck({ cwd: files.cwd,
      requestText: 'request' in material ? requestText(material.request) : material.prompt,
      targetPath, referencePaths, ...(engine === 'node-project' ? { outputPaths: files.outputPaths } : {}),
      criteria: material.criteria, cases: entry.cases, isolated: entry.isolated, requiredCondition: entry.requiredCondition }, engine)
    return [id, { material, materialDigest: sha256(material), producer }] as const
  }))
  const first = definitions.get('source1')!.material, cwd = first.files.cwd, qualityDigest = sha256(first.qualityContract)
  assert(roles.every(id => definitions.get(id)!.material.files.cwd === cwd && sha256(definitions.get(id)!.material.qualityContract) === qualityDigest))
  const cohortDigest = sha256(config)
  const independent = (id: 'adjacent' | 'holdout') => {
    const material = definitions.get(id)!.material
    assert('prompt' in material)
    return { prompt: material.prompt, criteria: [...material.criteria],
      files: { entries: structuredClone(material.files.entries), outputPaths: [...material.files.outputPaths] } }
  }
  return {
    async prepareIndependentCases(material) {
      material.signal.throwIfAborted()
      try {
        if (material.modelConfigDigest !== config.modelConfigDigest || material.cwd !== cwd || sha256(material.qualityContract) !== qualityDigest
          || material.sources.length !== 2) return undefined
        const originals = [...material.sources, material.counterexample]
        if (originals.some((value, index) => value.files === undefined
          || sha256(body({ ...value, files: value.files })) !== definitions.get(roles[index]!)!.materialDigest)) return undefined
        return { adjacent: independent('adjacent'), holdout: independent('holdout') }
      } catch { material.signal.throwIfAborted(); return undefined }
    },
    async prepare(material) {
      material.signal.throwIfAborted()
      try {
        const entry = definitions.get(material.caseId as FunctionalStudyRole)
        if (material.modelConfigDigest !== config.modelConfigDigest || entry === undefined || sha256(body(material)) !== entry.materialDigest) return undefined
        const prepared = await entry.producer.prepare(material)
        material.signal.throwIfAborted()
        return prepared === undefined ? undefined : { ...prepared,
          contractDigest: sha256({ functionalContract: prepared.contractDigest, cohortDigest, role: material.caseId }) }
      } catch { material.signal.throwIfAborted(); return undefined }
    },
  }
}
