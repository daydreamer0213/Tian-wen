import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import host from './development-isolated-node-project-host.json' with { type: 'json' }
import answerHost from './development-isolated-python-answer-host.json' with { type: 'json' }
import { buildDevelopmentFunctionalStudyCases } from './development-functional-study-cases.mjs'
import { createDevelopmentOrdinaryTaskCheck } from './development-ordinary-task-check.mjs'
import { createDevelopmentGoalTaskCheck } from './development-goal-task-check.mjs'
const packageUrl = new URL('../packages/tianwen-runtime-bundle/package.json', import.meta.url)
const manifest = JSON.parse(readFileSync(packageUrl, 'utf8'))
const require = createRequire(packageUrl)
const { parseConversationFileMaterial, parseConversationQualityContract } = await import(pathToFileURL(require.resolve('@tianwen/evolution')).href)
const { createConversationIsolatedNodeProjectCheck, createConversationStudyIsolatedNodeProjectCheck,
  createConversationStudyIsolatedNodeProjectCohortCheck, createGoalTaskIsolatedNodeProjectCheck,
  createConversationStudyIsolatedPythonAnswerCheck, createGoalTaskIsolatedPythonAnswerCheck,
  createConversationIsolatedPythonCheck, createConversationStudyIsolatedPythonCheck,
  createConversationStudyIsolatedPythonCohortCheck } = await import(new URL(manifest.exports['.'].default, packageUrl).href)

function pythonFileConfig(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  assert(!Object.hasOwn(config, 'moduleAliases'), 'Python file checks have no module aliases')
  assert(Array.isArray(config.outputPaths) && config.outputPaths.length === 1
    && config.outputPaths[0] === config.entryPath && /\.py$/u.test(config.entryPath), 'Python checks require one declared .py output equal to entryPath')
  const { entryPath, outputPaths, ...rest } = config
  return { ...rest, targetPath: entryPath, isolated: structuredClone(answerHost) }
}
function ordinaryFileFactory(engine) {
  return engine === 'python' ? config => createConversationIsolatedPythonCheck(pythonFileConfig(config)) : createDevelopmentIsolatedNodeProjectCheck
}

function withFixedHost(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  return { ...config, isolated: structuredClone(host) }
}
export function createDevelopmentIsolatedNodeProjectCheck(config) {
  return createConversationIsolatedNodeProjectCheck(withFixedHost(config))
}
export function createDevelopmentGoalTaskIsolatedNodeProjectCheck(config) {
  return createGoalTaskIsolatedNodeProjectCheck(withFixedHost(config))
}
export function createDevelopmentStudyIsolatedNodeProjectCheck(config) {
  return createConversationStudyIsolatedNodeProjectCheck(withFixedHost(config))
}
/** Caller-owned frozen roles and explicit entries; the SDK validates their complete original material. */
export function createDevelopmentStudyIsolatedNodeProjectCohortCheck(config) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  assert(config.cases !== null && typeof config.cases === 'object' && !Array.isArray(config.cases))
  const cases = Object.fromEntries(Object.entries(config.cases).map(([role, entry]) => [role, withFixedHost(entry)]))
  return createConversationStudyIsolatedNodeProjectCohortCheck({ ...config, cases })
}

/** Match frozen originals once; retain the SDK's closed cohort and fixed DEV host. */
export function createDevelopmentFunctionalStudyCohortCheck(config, material, codeEngine = 'node-project') {
  const cases = buildDevelopmentFunctionalStudyCases(config, material)
  if (cases === undefined) return undefined
  if (codeEngine === 'python') {
    const pythonCases = Object.fromEntries(Object.entries(cases).map(([role, entry]) => {
      const fixed = pythonFileConfig({ ...entry, outputPaths: entry.material.files.outputPaths })
      const { targetPath, ...definition } = fixed
      return [role, definition]
    }))
    return createConversationStudyIsolatedPythonCohortCheck({ modelConfigDigest: material.modelConfigDigest, cases: pythonCases })
  }
  assert.equal(codeEngine, 'node-project', 'DEV code engine is invalid')
  return createDevelopmentStudyIsolatedNodeProjectCohortCheck({ modelConfigDigest: material.modelConfigDigest, cases })
}

/** Fail on broken frozen contracts before the Runtime can consume a study attempt. */
function freezeStudyContracts(config, codeEngine) {
  assert(config !== null && typeof config === 'object' && !Array.isArray(config))
  assert(!Object.hasOwn(config, 'isolated'), 'DEV isolated override is not permitted')
  const frozen = structuredClone(config)
  buildDevelopmentFunctionalStudyCases(frozen, undefined)
  parseConversationQualityContract(frozen.qualityContract)
  for (const contract of [...frozen.originals, frozen.adjacent, frozen.holdout]) {
    const files = parseConversationFileMaterial({ schemaVersion: 'tianwen.conversation-file-material.v1',
      outputKind: 'files', cwd: frozen.cwd, entries: contract.entries, outputPaths: contract.outputPaths })
    const references = files.entries.filter(entry => !files.outputPaths.includes(entry.path))
    assert(references.every(entry => entry.content !== null), 'Frozen readonly input must have original content')
    // The executor's original static path rules also apply to absent future outputs.
    const names = new Set(files.entries.map(entry => entry.path.toLowerCase()))
    assert([...names].every(path => !path.split('/').includes('package.json')
      && path !== '.tianwen-loader.mjs' && !path.startsWith('.tianwen-loader.mjs/')), 'Frozen graph uses an executor-reserved path')
    for (const entry of files.entries) if (/\.(?:m?ts)$/u.test(entry.path)) {
      const alias = entry.path.replace(/\.mts$/u, '.mjs').replace(/\.ts$/u, '.js').toLowerCase()
      assert(!names.has(alias) && ![...names].some(name => name.startsWith(alias + '/') || alias.startsWith(name + '/')), 'Frozen graph conflicts with an original TypeScript module alias')
      names.add(alias)
    }
    assert(!Object.hasOwn(contract, 'isolated'), 'DEV isolated override is not permitted')
    // Constructor validation only: no environment preparation or invented task material.
    const constructorConfig = { cwd: frozen.cwd,
      requestText: contract.requestText ?? contract.prompt, entryPath: contract.entryPath,
      outputPaths: files.outputPaths, referencePaths: references.map(entry => entry.path),
      criteria: contract.criteria ?? [contract.requiredCondition], cases: contract.cases,
      requiredCondition: contract.requiredCondition,
      ...(Object.hasOwn(contract,'moduleAliases') ? {moduleAliases:contract.moduleAliases} : {}) }
    if (codeEngine === 'python') createConversationStudyIsolatedPythonCheck(pythonFileConfig(constructorConfig))
    else createDevelopmentStudyIsolatedNodeProjectCheck(constructorConfig)
  }
  return frozen
}

/** One frozen project scope; actual selected originals determine every closed cohort. */
export function createDevelopmentFunctionalStudyResultCheck(config, codeEngine = 'node-project') {
  assert(['node-project','python'].includes(codeEngine), 'DEV code engine is invalid')
  const frozen = freezeStudyContracts(config, codeEngine)
  let cohort, generation = 0
  return {
    async prepareIndependentCases(material) {
      const currentGeneration = ++generation
      cohort = undefined
      material.signal.throwIfAborted()
      try {
        const next = createDevelopmentFunctionalStudyCohortCheck(frozen, material, codeEngine)
        if (next === undefined) return undefined
        const independent = await next.prepareIndependentCases(material)
        material.signal.throwIfAborted()
        if (currentGeneration !== generation || independent === undefined) return undefined
        cohort = next
        return independent
      } catch {
        material.signal.throwIfAborted()
        return undefined
      }
    },
    async prepare(material) {
      material.signal.throwIfAborted()
      const current = cohort
      return current === undefined ? undefined : current.prepare(material)
    },
  }
}

/** Thin original Goal interface; all native authority remains in the public factory. */
function goalAnswerChecks(raw, cwd) {
  const contracts = structuredClone(Array.isArray(raw) ? raw : [raw]), routes = new Map(), goalRoutes = new Map(), staticGoals = new Set()
  assert(contracts.length > 0, 'DEV Goal answer contracts must be nonempty')
  const fields = ['cwd','family','material','modelConfigDigest','requiredCondition','verifierSource']
  for (const contract of contracts) {
    assert(contract !== null && typeof contract === 'object' && !Array.isArray(contract)
      && fields.every(key => Object.hasOwn(contract,key)) && Object.keys(contract).every(key => [...fields,'bindActualTask'].includes(key)),
      'DEV Goal answer contracts have missing or unsupported fields; isolated override is not permitted')
    assert.equal(contract.cwd,cwd,'DEV Goal answer contract must share the frozen cwd')
    assert(contract.bindActualTask === undefined || contract.bindActualTask === true, 'DEV actual Task binding must be explicitly true')
    const check = createGoalTaskIsolatedPythonAnswerCheck({ ...contract, isolated: structuredClone(answerHost) })
    // The constructor has already validated the complete native prompt and
    // criteria. Route only; do not reinterpret its command or authority here.
    const original = JSON.parse(contract.material.prompt), task = original.delegatedTask
    const goalKey = JSON.stringify([original.originalCommand, original.goal.objective,
      original.goal.context, original.goal.successCriteria, original.permissionMode ?? null])
    if (contract.bindActualTask === true) {
      assert(!goalRoutes.has(goalKey),'DEV whole-Goal answer routes must be distinct')
      goalRoutes.set(goalKey,check)
    } else {
      assert(!routes.has(task),'DEV Goal answer task routes must be distinct')
      routes.set(task,check)
      staticGoals.add(goalKey)
    }
  }
  assert([...goalRoutes.keys()].every(key => !staticGoals.has(key)), 'DEV whole-Goal and static Task routes must not overlap')
  async function select(input) {
    const direct = routes.get(input?.task?.objective)
    if (direct !== undefined) {
      const scope = await direct.methodScope(input)
      if (scope !== undefined) return { check: direct, scope }
    }
    for (const check of goalRoutes.values()) {
      const scope = await check.methodScope(input)
      if (scope !== undefined) return { check, scope }
    }
    return undefined
  }
  return {
    async methodScope(input) { return (await select(input))?.scope },
    async prepare(input) { return (await select(input))?.check.prepare(input) },
  }
}

/** Spread these host-owned options into the actual DEV Runtime before tasks arrive. */
export function createDevelopmentNativeCheckOptions(ordinaryContract, studyContracts, goalContract, answerStudyContracts, goalAnswerContracts, codeEngine = 'node-project') {
  assert(['node-project','python'].includes(codeEngine), 'DEV code engine is invalid')
  assert(codeEngine !== 'python' || goalContract === undefined, 'Python file mode supports ordinary tasks, not Goal code contracts')
  assert(goalContract === undefined || goalAnswerContracts === undefined, 'DEV Goal code and answer checker modes are mutually exclusive')
  const ordinaryContracts = Array.isArray(ordinaryContract) ? ordinaryContract : [ordinaryContract]
  for (const contract of ordinaryContracts)
    assert.equal(contract?.cwd, studyContracts.cwd, 'DEV ordinary and study contracts must share the frozen cwd')
  const studyResultCheck = createDevelopmentFunctionalStudyResultCheck(studyContracts, codeEngine)
  if (goalContract !== undefined) for (const contract of Array.isArray(goalContract) ? goalContract : [goalContract])
    assert.equal(contract?.cwd, studyContracts.cwd, 'DEV Goal contract must share the frozen cwd')
  let answerStudyResultCheck
  if (answerStudyContracts !== undefined) {
    assert(answerStudyContracts !== null && typeof answerStudyContracts === 'object' && !Array.isArray(answerStudyContracts))
    assert(['modelConfigDigest','cases'].every(key => Object.hasOwn(answerStudyContracts,key))
      && Object.keys(answerStudyContracts).every(key => ['modelConfigDigest','cases','provideIndependentCases','bindActualGoalTasks'].includes(key)),
      'DEV answer contracts have missing or unsupported fields; isolated override is not permitted')
    assert(Array.isArray(answerStudyContracts.cases))
    for (const entry of answerStudyContracts.cases) if (entry?.material?.files !== undefined)
      assert.equal(entry.material.files.cwd, studyContracts.cwd, 'DEV answer file contract must share the frozen cwd')
    // Trusted operator data only; the SDK clones/validates material. Loading
    // constructs the original factory, never prepares Docker or runs a check.
    answerStudyResultCheck = createConversationStudyIsolatedPythonAnswerCheck({ ...answerStudyContracts, isolated: structuredClone(answerHost) })
  }
  return { externalCodeCheck: createDevelopmentOrdinaryTaskCheck(ordinaryContract, ordinaryFileFactory(codeEngine)), studyResultCheck,
    ...(answerStudyResultCheck === undefined ? {} : { answerStudyResultCheck }),
    ...(goalContract === undefined ? {} : { goalTaskAcceptance: createDevelopmentGoalTaskCheck(goalContract, createDevelopmentGoalTaskIsolatedNodeProjectCheck) }),
    ...(goalAnswerContracts === undefined ? {} : { goalTaskAcceptance: goalAnswerChecks(goalAnswerContracts,studyContracts.cwd) }) }
}
