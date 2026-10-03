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
