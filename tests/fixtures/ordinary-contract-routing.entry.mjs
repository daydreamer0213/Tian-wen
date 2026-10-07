import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createDevelopmentOrdinaryTaskCheck } from '../../scripts/development-ordinary-task-check.mjs'

const envelope = JSON.parse(readFileSync(0, 'utf8'))
const rows = JSON.parse(gunzipSync(Buffer.from(envelope.payload, 'base64')))
const results = []
for (const row of rows) {
  const config = structuredClone(row.config), material = structuredClone(row.material)
  const constructions = [], calls = []
  let exactMaterial = true, returnedIdentity = true, originalError = true
  const marker = new Error('original preparation rejected')
  const frozenSnapshot = JSON.stringify(config)
  const factory = row.invalidFactory ? null : contract => {
    constructions.push(contract)
    if (row.factoryThrows) throw marker
    if (row.badCheck) return {}
    const prepared = { checkerId: contract.token, async evaluate() { return 'original evaluator' } }
    return { async prepare(actual) {
      calls.push(contract.token)
      exactMaterial &&= actual === material
      if (row.prepareThrows) throw marker
      if (row.prepareUndefined) return undefined
      return prepared
    }, prepared }
  }
  const checks = []
  const wrappedFactory = factory === null ? null : contract => {
    const check = factory(contract); checks.push(check); return check
  }
  try {
    const check = createDevelopmentOrdinaryTaskCheck(config, wrappedFactory)
    const unchangedAtConstruction = JSON.stringify(config) === frozenSnapshot
    if (row.mutate) {
      const first = Array.isArray(config) ? config[0] : config
      first.requestText = 'changed'; first.token = 'changed'; first.nested.value = 'changed'
      if (Array.isArray(config)) config.reverse()
    }
    const before = JSON.stringify(material)
    let prepared
    try { prepared = await check.prepare(material) }
    catch (error) { originalError = error === marker; throw error }
    if (prepared !== undefined) returnedIdentity = checks.some(item => item?.prepared === prepared)
    results.push({ id: row.id, constructors: constructions.map(c => c.token), nested: constructions.map(c => c.nested?.value), calls,
      selected: prepared?.checkerId ?? null, exactMaterial, returnedIdentity, unchangedAtConstruction,
      materialUnchanged: JSON.stringify(material) === before })
  } catch (error) {
    results.push({ id: row.id, error: error === marker ? 'original-error' : error.name,
      constructors: constructions.map(c => c.token), calls, originalError })
  }
}
console.log(JSON.stringify(results))
