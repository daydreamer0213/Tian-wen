import { isDeepStrictEqual } from 'node:util'
import { parseNativeGoalStudyInput } from '../packages/tianwen-runtime-bundle/dist/goal-task-study-input.js'

// Frozen material schema constants for conversation file graphs.
const FILE_SCHEMA_VERSION = 'tianwen.conversation-file-material.v1'
const FILE_OUTPUT_KIND = 'files'

// Keys retained when projecting an original (matched) raw material.
const ORIGINAL_MATERIAL_KEYS = [
  'request',
  'context',
  'objective',
  'criteria',
  'qualityContract',
  'files',
]

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNonEmptyString = value => typeof value === 'string' && value.length > 0

function clone(value) {
  return structuredClone(value)
}

// --- config validation (shape corruption throws TypeError) -----------------

function assertGraphShape(input, label) {
  if (!isObject(input)) throw new TypeError(`${label} must be an object`)

  const { entries, outputPaths, entryPath, cases, requiredCondition } = input

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError(`${label}.entries must be a non-empty array`)
  }
  const paths = new Set()
  for (const entry of entries) {
    if (!isObject(entry)) throw new TypeError(`${label}.entries items must be objects`)
    if (!isNonEmptyString(entry.path)) throw new TypeError(`${label}.entries[].path must be a non-empty string`)
    if (entry.content !== null && typeof entry.content !== 'string') {
      throw new TypeError(`${label}.entries[].content must be a string or null`)
    }
    if (paths.has(entry.path)) throw new TypeError(`${label}.entries paths must be unique`)
    paths.add(entry.path)
  }

  if (!Array.isArray(outputPaths) || outputPaths.length === 0) {
    throw new TypeError(`${label}.outputPaths must be a non-empty array`)
  }
  const seenOutputs = new Set()
  for (const outputPath of outputPaths) {
    if (!isNonEmptyString(outputPath)) throw new TypeError(`${label}.outputPaths items must be non-empty strings`)
    if (seenOutputs.has(outputPath)) throw new TypeError(`${label}.outputPaths must be unique`)
    if (!paths.has(outputPath)) throw new TypeError(`${label}.outputPaths must be listed in entries`)
    seenOutputs.add(outputPath)
  }

  if (!isNonEmptyString(entryPath)) throw new TypeError(`${label}.entryPath must be a non-empty string`)
  if (!paths.has(entryPath)) throw new TypeError(`${label}.entryPath must be listed in entries`)

  if (!Array.isArray(cases) || cases.length === 0) {
    throw new TypeError(`${label}.cases must be a non-empty array`)
  }
  if (!isNonEmptyString(requiredCondition)) {
    throw new TypeError(`${label}.requiredCondition must be a non-empty string`)
  }
}

function validateConfig(config) {
  if (!isObject(config)) throw new TypeError('config must be an object')
  if (!isNonEmptyString(config.cwd)) throw new TypeError('config.cwd must be a non-empty string')
  if (!isObject(config.qualityContract)) throw new TypeError('config.qualityContract must be a non-null object')
  if (!Array.isArray(config.originals) || config.originals.length < 3) {
    throw new TypeError('config.originals must contain at least three contracts')
  }

  const seenRequestText = new Set()
  for (const original of config.originals) {
    assertGraphShape(original, 'original')
    if (!isNonEmptyString(original.requestText)) {
      throw new TypeError('original.requestText must be a non-empty string')
    }
    if (seenRequestText.has(original.requestText)) {
      throw new TypeError('original.requestText must not repeat')
    }
    seenRequestText.add(original.requestText)
  }

  for (const key of ['adjacent', 'holdout']) {
    const independent = config[key]
    assertGraphShape(independent, key)
    if (!isNonEmptyString(independent.prompt)) {
      throw new TypeError(`${key}.prompt must be a non-empty string`)
    }
    if (!Array.isArray(independent.criteria) || independent.criteria.length === 0) {
      throw new TypeError(`${key}.criteria must be a non-empty array`)
    }
    for (const criterion of independent.criteria) {
      if (!isNonEmptyString(criterion)) throw new TypeError(`${key}.criteria items must be non-empty strings`)
    }
  }
}

// --- material validation (unknown or damaged material yields undefined) -----

// Projects the request the same way the original SDK does: walk messages and
// content blocks in order, take the text of text blocks, join with newlines.
function projectRequest(request) {
  if (!Array.isArray(request)) return undefined
  const parts = []
  for (const message of request) {
    if (!isObject(message) || !Array.isArray(message.content)) return undefined
    for (const block of message.content) {
      if (!isObject(block)) return undefined
      if (block.type !== 'text') continue
      if (typeof block.text !== 'string') return undefined
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function isValidFiles(files, cwd) {
  if (!isObject(files)) return false
  if (files.schemaVersion !== FILE_SCHEMA_VERSION) return false
  if (files.outputKind !== FILE_OUTPUT_KIND) return false
  if (files.cwd !== cwd) return false

  if (!Array.isArray(files.entries) || files.entries.length === 0) return false
  const paths = new Set()
  for (const entry of files.entries) {
    if (!isObject(entry)) return false
    if (!isNonEmptyString(entry.path)) return false
    if (entry.content !== null && typeof entry.content !== 'string') return false
    if (paths.has(entry.path)) return false
    paths.add(entry.path)
  }

  if (!Array.isArray(files.outputPaths) || files.outputPaths.length === 0) return false
  const seenOutputs = new Set()
  for (const outputPath of files.outputPaths) {
    if (!isNonEmptyString(outputPath)) return false
    if (seenOutputs.has(outputPath)) return false
    if (!paths.has(outputPath)) return false
    seenOutputs.add(outputPath)
  }

  return true
}

// Compares the complete file graph as a set: order independent, but missing,
// duplicate, extra or content-drifted entries never match.
function graphMatchesContract(contract, files) {
  const contractEntries = new Map(contract.entries.map(entry => [entry.path, entry.content]))
  if (files.entries.length !== contractEntries.size) return false
  const seenEntries = new Set()
  for (const entry of files.entries) {
    if (typeof entry.path !== 'string' || !contractEntries.has(entry.path)) return false
    if (seenEntries.has(entry.path)) return false
    seenEntries.add(entry.path)
    if (contractEntries.get(entry.path) !== entry.content) return false
  }

  const contractOutputs = new Set(contract.outputPaths)
  if (files.outputPaths.length !== contractOutputs.size) return false
  const seenOutputs = new Set()
  for (const outputPath of files.outputPaths) {
    if (!contractOutputs.has(outputPath) || seenOutputs.has(outputPath)) return false
    seenOutputs.add(outputPath)
  }

  return true
}

// Resolves a raw material to exactly one distinct original contract index, or
// returns null when the material is unknown, damaged or ambiguous.
function resolveMaterial(config, raw) {
  if (!isObject(raw)) return null
  const native = raw.sourceKind === 'native-goal-task'
  if (Object.hasOwn(raw,'sourceKind') && !native) return null
  if ((!native && (!Array.isArray(raw.context) || typeof raw.objective !== 'string'))
    || !Array.isArray(raw.criteria) || !raw.criteria.every(isNonEmptyString)) return null
  if (!isObject(raw.qualityContract) || !isDeepStrictEqual(raw.qualityContract, config.qualityContract)) {
    return null
  }
  if (!isValidFiles(raw.files, config.cwd)) return null

  let projected
  try { projected = native ? parseNativeGoalStudyInput(raw.prompt).delegatedTask : projectRequest(raw.request) } catch { return null }
  if (projected === undefined) return null

  let matchedIndex = -1
  let matchCount = 0
  for (let index = 0; index < config.originals.length; index += 1) {
    const contract = config.originals[index]
    if (contract.requestText !== projected) continue
    if (native && !raw.criteria.includes(contract.requiredCondition)) continue
    if (!graphMatchesContract(contract, raw.files)) continue
    matchedIndex = index
    matchCount += 1
  }
  if (matchCount !== 1) return null
  return matchedIndex
}

// --- output projection ------------------------------------------------------

function buildOriginalEntry(config, index, raw) {
  const contract = config.originals[index]
  const material = {}
  for (const key of raw.sourceKind === 'native-goal-task' ? ['sourceKind','prompt','criteria','qualityContract','files'] : ORIGINAL_MATERIAL_KEYS) {
    material[key] = clone(raw[key])
  }
  if (Object.hasOwn(raw, 'feedbackStandard')) {
    material.feedbackStandard = clone(raw.feedbackStandard)
  }
  return {
    material,
    entryPath: contract.entryPath,
    cases: clone(contract.cases),
    requiredCondition: contract.requiredCondition,
    ...(Object.hasOwn(contract,'moduleAliases') ? {moduleAliases:clone(contract.moduleAliases)} : {}),
  }
}

function buildIndependentEntry(config, key) {
  const independent = config[key]
  return {
    material: {
      prompt: independent.prompt,
      criteria: clone(independent.criteria),
      qualityContract: clone(config.qualityContract),
      files: {
        schemaVersion: FILE_SCHEMA_VERSION,
        outputKind: FILE_OUTPUT_KIND,
        cwd: config.cwd,
        entries: clone(independent.entries),
        outputPaths: clone(independent.outputPaths),
      },
    },
    entryPath: independent.entryPath,
    cases: clone(independent.cases),
    requiredCondition: independent.requiredCondition,
    ...(Object.hasOwn(independent,'moduleAliases') ? {moduleAliases:clone(independent.moduleAliases)} : {}),
  }
}

export function buildDevelopmentFunctionalStudyCases(config, material) {
  // Shape corruption in the frozen config is a hard error.
  validateConfig(config)

  if (!isObject(material)) return undefined
  if (material.cwd !== config.cwd) return undefined
  if (!isObject(material.qualityContract) || !isDeepStrictEqual(material.qualityContract, config.qualityContract)) {
    return undefined
  }
  if (!Array.isArray(material.sources) || material.sources.length !== 2) return undefined
  if (new Set([...material.sources,material.counterexample].map(source=>source?.sourceKind)).size !== 1) return undefined

  const resolved = [
    resolveMaterial(config, material.sources[0]),
    resolveMaterial(config, material.sources[1]),
    resolveMaterial(config, material.counterexample),
  ]
  if (resolved.some(index => index === null)) return undefined
  if (new Set(resolved).size !== 3) return undefined

  try {
    return {
      source1: buildOriginalEntry(config, resolved[0], material.sources[0]),
      source2: buildOriginalEntry(config, resolved[1], material.sources[1]),
      counterexample: buildOriginalEntry(config, resolved[2], material.counterexample),
      adjacent: buildIndependentEntry(config, 'adjacent'),
      holdout: buildIndependentEntry(config, 'holdout'),
    }
  } catch {
    return undefined
  }
}
