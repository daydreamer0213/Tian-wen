import { expect, it } from 'vitest'
import * as publicApi from '../../packages/tianwen-runtime-bundle/src/index.js'
import * as scriptApi from '../../scripts/conversation-isolated-python-check.js'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

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

it('delivers all Node factories through the actual published JS root with bounded cases and target modes', async () => {
  const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const bundled = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle')).href)
  for (const name of ['createConversationIsolatedNodeCheck', 'createConversationStudyIsolatedNodeCheck', 'createConversationStudyIsolatedNodeCohortCheck'])
    expect(bundled[name]).toBeTypeOf('function')
  const config = { cwd: 'D:/DevData/tianwen-node-functional-check-20261003', requestText: 'Implement a fixed Node JSON CLI.', targetPath: 'task.ts',
    cases: [{ id: 'exact', input: '{}', expectedJson: '9007199254740993', exitCode: 0 }],
    isolated: { cliPath: 'D:/unused.exe', endpoint: 'unix:///unused', imageRef: 'node@sha256:' + 'a'.repeat(64), imageId: 'sha256:' + 'a'.repeat(64),
      workRoot: 'D:/DevData/tianwen-node-functional-check-20261003/unused' } }
  for (const targetPath of ['task.js', 'task.mjs', 'task.ts', 'task.mts']) expect(() => bundled.createConversationIsolatedNodeCheck({ ...config, targetPath })).not.toThrow()
  for (const targetPath of ['task.py', 'task.tsx', 'task.cjs', 'task.js/../other']) expect(() => bundled.createConversationIsolatedNodeCheck({ ...config, targetPath })).toThrow()
  expect(() => bundled.createConversationIsolatedNodeCheck({ ...config, cases: [{ ...config.cases[0]!, expectedJson: '{"a":1,"a":2}' }] })).toThrow()
})

it('publishes the native Goal project factory with original command and mandatory-condition validation', async () => {
  const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const bundled = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle')).href)
  const config = { cwd: 'D:/DevData/tianwen-native-goal-project-check-20261003', requestText: 'Implement original modules.',
    goalCommand: 'Complete original project work.', requiredCondition: 'Preserve the original functional JSON result.',
    entryPath: 'entry.mjs', outputPaths: ['result.ts'], referencePaths: ['entry.mjs'],
    cases: [{ id: 'original-case', input: '{}', expectedJson: '{"n":7}', exitCode: 0 }],
    isolated: { cliPath: 'D:/unused.exe', endpoint: 'unix:///unused', imageRef: 'node@sha256:'+'a'.repeat(64),
      imageId: 'sha256:'+'a'.repeat(64), workRoot: 'D:/DevData/tianwen-native-goal-project-check-20261003/unused' } }
  expect(bundled.createGoalTaskIsolatedNodeProjectCheck).toBeTypeOf('function')
  const check=bundled.createGoalTaskIsolatedNodeProjectCheck(config)
  expect(check.prepare).toBeTypeOf('function');expect(check.methodScope).toBeTypeOf('function')
  for(const change of [{goalCommand:''},{goalCommand:' extra whitespace '},{requiredCondition:undefined},{requiredCondition:' '},
    {cases:[]},{cases:[{...config.cases[0]!,expectedJson:'{"n":1,"n":2}'}]}]) {
    expect(()=>bundled.createGoalTaskIsolatedNodeProjectCheck({...config,...change})).toThrow()
  }
})
it('keeps compatibility scripts on the exact public ordinary and study factories', () => {
  for (const name of ['createConversationIsolatedPythonCheck', 'createConversationStudyIsolatedPythonCheck',
    'createConversationStudyIsolatedPythonCohortCheck'] as const) {
    expect(publicApi[name]).toBe(scriptApi[name])
  }
})
