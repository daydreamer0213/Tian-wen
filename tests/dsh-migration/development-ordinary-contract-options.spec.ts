import { expect, it } from 'vitest'
import { createDevelopmentNativeCheckOptions } from '../../scripts/development-isolated-node-project-check.mjs'
import { developmentStudyResultFixture } from '../../scripts/test-fixtures/development-study-result-host.mjs'

it('admits multiple original contracts through the existing DEV options and leaves unknown tasks unprepared', async () => {
  const f = developmentStudyResultFixture()
  const options = createDevelopmentNativeCheckOptions([1,2,3].map(f.ordinary), f.config)
  expect(options.studyResultCheck.prepareIndependentCases).toBeTypeOf('function')
  expect(await options.externalCodeCheck.prepare({ request: [{content:[{type:'text',text:'unrelated task'}]}] })).toBeUndefined()
})
it('preserves single-contract and optional native Goal composition', () => {
  const f = developmentStudyResultFixture(), ordinary = f.ordinary(1)
  const goal = {...ordinary,goalCommand:'Complete original modules.'}
  const options = createDevelopmentNativeCheckOptions(ordinary,f.config,goal)
  expect(options.externalCodeCheck.prepare).toBeTypeOf('function')
  expect(options.goalTaskAcceptance.prepare).toBeTypeOf('function')
})
it('refuses any ordinary contract outside the original study cwd and refuses duplicate raw requests', () => {
  const f = developmentStudyResultFixture()
  expect(() => createDevelopmentNativeCheckOptions([f.ordinary(1),{...f.ordinary(2),cwd:'D:/DevData/unrelated'}],f.config)).toThrow(/share.*cwd/)
  expect(() => createDevelopmentNativeCheckOptions([f.ordinary(1),f.ordinary(1)],f.config)).toThrow()
})
it('routes multiple original Goal Task contracts through DEV options without inferring an unknown task', async () => {
  const f = developmentStudyResultFixture()
  const goals = [1, 2, 3].map(index => ({...f.ordinary(index), goalCommand:'Complete original modules.'}))
  const options = createDevelopmentNativeCheckOptions(f.ordinary(1), f.config, goals)
  expect(options.goalTaskAcceptance.methodScope).toBeTypeOf('function')
  expect(await options.goalTaskAcceptance.methodScope({task:{objective:'unknown task'}})).toBeUndefined()
  expect(await options.goalTaskAcceptance.prepare({task:{objective:'unknown task'}})).toBeUndefined()
  expect(await options.goalTaskAcceptance.prepare({goal:{objective:goals[0].requestText}})).toBeUndefined()
})
it('refuses Goal arrays with a different frozen project, Goal command or duplicate raw task requirement', () => {
  const f = developmentStudyResultFixture()
  const goal = index => ({...f.ordinary(index),goalCommand:'Complete original modules.'})
  expect(() => createDevelopmentNativeCheckOptions(f.ordinary(1),f.config,[goal(1),{...goal(2),cwd:'D:/DevData/unrelated'}])).toThrow(/share.*cwd/)
  expect(() => createDevelopmentNativeCheckOptions(f.ordinary(1),f.config,[goal(1),{...goal(2),goalCommand:'Another Goal.'}])).toThrow(/same goalCommand/)
  expect(() => createDevelopmentNativeCheckOptions(f.ordinary(1),f.config,[goal(1),goal(1)])).toThrow(/distinct/)
})
