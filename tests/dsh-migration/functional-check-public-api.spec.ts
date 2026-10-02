import { expect, it } from 'vitest'
import * as publicApi from '../../packages/tianwen-runtime-bundle/src/index.js'
import * as scriptApi from '../../scripts/conversation-isolated-python-check.js'

it('uses the concrete public producer to validate host cases before any execution', () => {
  const create = publicApi.createConversationIsolatedPythonCheck
  const config = { cwd: 'D:/DevData/tianwen-reusable-result-checks-20261002', requestText: 'Create task.py', targetPath: 'task.py',
    cases: [{ id: 'exact-number', input: '{}', expectedJson: '{"n":9007199254740993}', exitCode: 0 }],
    isolated: { cliPath: 'D:/unused.exe', endpoint: 'unix:///unused', imageRef: 'python@sha256:' + 'a'.repeat(64),
      imageId: 'sha256:' + 'a'.repeat(64), workRoot: 'D:/DevData/tianwen-reusable-result-checks-20261002/unused' } }
  expect(() => create(config)).not.toThrow()
  expect(() => create({ ...config, cases: [{ ...config.cases[0]!, expectedJson: '{"n":1,"n":2}' }] })).toThrow()
  expect(() => create({ ...config, cases: [] })).toThrow()
})

it('keeps compatibility scripts on the exact public ordinary and study factories', () => {
  for (const name of ['createConversationIsolatedPythonCheck', 'createConversationStudyIsolatedPythonCheck',
    'createConversationStudyIsolatedPythonCohortCheck'] as const) {
    expect(publicApi[name]).toBe(scriptApi[name])
  }
})
