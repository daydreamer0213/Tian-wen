import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {expect, it} from 'vitest'
import {nodeProjectPolicy} from '../../packages/tianwen-runtime-bundle/src/isolated-node-project.js'
import {prepareGoalRoutingCaseBatch} from '../../scripts/test-fixtures/goal-contract-routing-cases.mjs'

// Post-result engineering regression; not a replacement natural acceptance.
const rows = JSON.parse(readFileSync(new URL('../../scripts/test-fixtures/goal-contract-routing-cases.json', import.meta.url), 'utf8'))
it('refuses the oversized aggregate before any candidate execution', () => {
  expect(() => prepareGoalRoutingCaseBatch(rows, nodeProjectPolicy.outputBytes)).toThrow(/exceeds.*budget/)
})
it('refuses a malformed-string fixture accidentally encoded as an ordinary object', () => {
  const row = structuredClone(rows.find(row => row.id === 'material-string'))
  row.material = {task:{objective:'first Task'}}
  expect(() => prepareGoalRoutingCaseBatch([row], nodeProjectPolicy.outputBytes)).toThrow(/actual string/)
})
it.each([0,22])('preserves the original Goal router contract in bounded engineering batch %s', offset => {
  const batch = prepareGoalRoutingCaseBatch(rows.slice(offset, offset + 22), nodeProjectPolicy.outputBytes)
  const result = spawnSync(process.execPath, ['tests/fixtures/goal-contract-routing.entry.mjs'], {input:batch.input,encoding:'utf8',timeout:20000,maxBuffer:nodeProjectPolicy.outputBytes})
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(batch.expectedJson))
})
