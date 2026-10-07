import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import type { ConversationExternalCodePreparation } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'
import type { ConversationStudyResultPreparation } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'

const base = 'D:/DevData/tianwen-node-functional-check-20261003'
const imageRef = 'public.ecr.aws/docker/library/node@sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605'
it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')('prepares the final published fixed runtime for both module modes without executing candidates', async () => {
  const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const { createConversationStudyIsolatedNodeCheck } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle')).href)
  const image = JSON.parse(readFileSync(resolve(base, 'image-inspect.json'), 'utf8'))
  const outcomes = []
  for (const targetPath of ['new.mjs', 'new.mts']) {
    const condition = 'Return exact JSON using the fixed Node 22.23.1 runtime.'
    const config = { cwd: resolve(base, 'absent-saved-task'), requestText: condition, targetPath, requiredCondition: condition, criteria: [condition],
      cases: [{ id: 'not-executed', input: '{}', expectedJson: '{}', exitCode: 0 }],
      isolated: { cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine', imageRef,
        imageId: image.Id as string, workRoot: resolve(base, 'fixed-version-preflight') } }
    const prepared = await createConversationStudyIsolatedNodeCheck(config).prepare({ prompt: condition, criteria: config.criteria,
      files: { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd: config.cwd, entries: [{ path: targetPath, content: null }], outputPaths: [targetPath] },
      caseId: 'holdout', modelConfigDigest: sha256('controlled-final-preparation'), signal: new AbortController().signal })
    expect(prepared?.checkerId).toBe('conversation-isolated-node-json-cli.v1')
    outcomes.push({ targetPath, checkerId: prepared!.checkerId, contractDigest: prepared!.contractDigest })
  }
  writeFileSync(resolve(base, 'final-published-preparation.json'), JSON.stringify({ outcomes, executedCandidates: 0 }, null, 2))
})
for (const language of ['javascript', 'typescript'] as const)
it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')(`published ${language} factories execute captured output and reject runtime errors independently`, async () => {
  const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const { createConversationIsolatedNodeCheck, createConversationStudyIsolatedNodeCheck } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle')).href)
  const roots = resolve(base, 'test-roots'); mkdirSync(roots, { recursive: true }); const cwd = mkdtempSync(join(roots, 'native-'))
  const signal = new AbortController().signal, target = language === 'typescript' ? 'task.ts' : 'task.js'
  const requiredCondition = 'Use the fixed Node single-file ESM runtime. Return exact JSON successor n+1, exit zero, empty stderr.'
  const requestText = `Implement ${target} using contract.md. ${requiredCondition}`
  const entries = [{ path: target, content: null }, { path: 'contract.md', content: requiredCondition }]
  writeFileSync(join(cwd, 'contract.md'), requiredCondition)
  const inspect = JSON.parse(readFileSync(resolve(base, 'image-inspect.json'), 'utf8'))
  const isolated = { cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine', imageRef, imageId: inspect.Id as string,
    workRoot: resolve(base, 'receipts', language), timeoutMs: 1000 }
  const cases = [{ id: 'new-small', input: '{"n":659}', expectedJson: '{"n":660}', exitCode: 0 }]
  const material = { cwd, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: requestText }] })], context: [], modelConfigDigest: sha256('controlled-node'), signal,
    task: { admission: { decision: { kind: 'task', family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files' } } } } as unknown as ConversationExternalCodePreparation
  const annotation = language === 'typescript' ? ': {n: number}' : ''
  const program = (delta: number) => `import {readFileSync} from 'node:fs'; const x${annotation}=JSON.parse(readFileSync(0,'utf8')); console.log(JSON.stringify({n:x.n+${delta}}))`
  const candidate = (source: string) => ({ request: material.request, context: material.context, signal, inputs: entries,
    outputs: [{ path: target, content: source }, entries[1]!], outputPaths: [target] })
  const outcomes: { mechanism: string; status: string }[] = []
  try {
    const ordinary = await createConversationIsolatedNodeCheck({ cwd, requestText, targetPath: target, referencePaths: ['contract.md'], cases, isolated, requiredCondition }).prepare(material)
    expect(ordinary).toBeDefined()
    // Disk bytes are neither the candidate nor the source of the frozen oracle.
    writeFileSync(join(cwd, target), 'throw new Error("disk must not execute")')
    for (const [mechanism, source, status] of [
      ['normal', program(1), 'verified'], ['wrong-functional-output', program(2), 'rejected'],
      ['timeout', 'while(true){}', 'unverifiable'],
    ]) {
      const result = await ordinary!.evaluate(candidate(source!)); expect(result.status).toBe(status)
      if (status === 'rejected') expect(result.failedRequiredConditionDigest).toBe(sha256(requiredCondition))
      if (status === 'unverifiable') expect(result).not.toHaveProperty('failedRequiredConditionDigest')
      outcomes.push({ mechanism: mechanism!, status: result.status })
    }
    rmSync(join(cwd, target))
    const exact = await createConversationIsolatedNodeCheck({ cwd, requestText, targetPath: target, referencePaths: ['contract.md'], isolated, requiredCondition,
      cases: [{ id: 'exact-integer', input: '{"n":9007199254740992}', expectedJson: '{"n":9007199254740993}', exitCode: 0 }] }).prepare(material)
    expect((await exact!.evaluate(candidate(program(1)))).status).toBe('rejected')
    outcomes.push({ mechanism: 'javascript-rounding-counterexample', status: 'rejected' })
    const study = { prompt: requestText, criteria: [requiredCondition], files: { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd, entries, outputPaths: [target] },
      caseId: 'holdout', modelConfigDigest: material.modelConfigDigest, signal } satisfies ConversationStudyResultPreparation
    const prepared = await createConversationStudyIsolatedNodeCheck({ cwd, requestText, targetPath: target, referencePaths: ['contract.md'], cases, isolated,
      requiredCondition, criteria: study.criteria }).prepare(study)
    expect(prepared).toBeDefined()
    for (const delta of [1, 2]) {
      const captured = candidate(program(delta))
      const result = await prepared!.evaluate({ prompt: study.prompt, criteria: study.criteria, files: study.files, answer: '',
        inputs: captured.inputs, outputs: captured.outputs, outputPaths: captured.outputPaths, signal })
      expect(result.status).toBe(delta === 1 ? 'verified' : 'rejected'); outcomes.push({ mechanism: `saved-study-${delta}`, status: result.status })
    }
    writeFileSync(resolve(base, `${language}-native-result.json`), JSON.stringify({ scope: 'controlled published functional mechanism; no model or natural learning', outcomes }, null, 2))
  } finally {
    expect(realpathSync(cwd).toLowerCase()).toBe(cwd.toLowerCase()); expect(cwd.startsWith(roots)).toBe(true); rmSync(cwd, { recursive: true, force: true })
  }
}, 90000)
