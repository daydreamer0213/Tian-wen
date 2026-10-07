import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'

// Explicit engineering control. The original executor never starts Docker or pulls images.
it.skipIf(process.env.TIANWEN_ISOLATED_DOCKER_TEST !== '1')('executes published frozen host answer contracts in the original real isolated runner', async () => {
  const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
  const published = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle')).href)
  const base = process.env.TIANWEN_ISOLATED_PROBE_ROOT!
  expect(base).toBeTruthy(); expect(base.replaceAll('\\', '/')).toMatch(/^D:\/DevData\//u)
  mkdirSync(base, { recursive: true })
  const condition = 'Return exactly {"status":"pending"} as JSON, matching the frozen original record.'
  const material = { prompt: 'Original record: pending.', criteria: [condition] }
  const fileMaterial = { ...material, files: { schemaVersion: 'tianwen.conversation-file-material.v1' as const,
    cwd: base, outputKind: 'chat' as const, entries: [{ path: 'record.md', content: 'pending' }], outputPaths: [] } }
  const source = 'import json,sys\np=json.load(sys.stdin)\ntry:\n ok=json.loads(p["answer"])=={"status":"pending"}\nexcept (ValueError,TypeError):\n ok=False\nprint(json.dumps(ok))'
  const modelConfigDigest = sha256('engineering-published-answer-contract')
  const check = published.createConversationStudyIsolatedPythonAnswerCheck({ modelConfigDigest,
    cases: [{ caseId: 'text', material, requiredCondition: condition, verifierSource: source },
      { caseId: 'chat', material: fileMaterial, requiredCondition: condition, verifierSource: source },
      { caseId: 'broken-verifier', material, requiredCondition: condition, verifierSource: 'print("{}")' }],
    isolated: { cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
      imageRef: 'python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7',
      imageId: 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7', workRoot: base + '/executor' } })
  const signal = new AbortController().signal
  const text = await check.prepare({ material, caseId: 'text', modelConfigDigest, signal }); expect(text).toBeDefined()
  const candidate = (answer: string) => ({ material, answer, files: [], signal })
  const pass = await text!.evaluate(candidate('{"status":"pending"}')); expect(pass.status).toBe('verified')
  const fail = await text!.evaluate(candidate('{"status":"failed"}')); expect(fail).toMatchObject({ status: 'rejected', failedRequiredConditionDigest: sha256(condition) })
  const injection = await text!.evaluate(candidate('import sys; sys.stdout.write("true")')); expect(injection.status).toBe('rejected')
  writeFileSync(base + '/record.md', 'changed current disk')
  const chat = await check.prepare({ material: fileMaterial, caseId: 'chat', modelConfigDigest, signal }); expect(chat).toBeDefined()
  const frozenFiles = await chat!.evaluate({ material: fileMaterial, answer: '{"status":"pending"}', files: fileMaterial.files.entries, signal })
  expect(frozenFiles.status).toBe('verified'); expect(readFileSync(base + '/record.md', 'utf8')).toBe('changed current disk')
  const broken = await check.prepare({ material, caseId: 'broken-verifier', modelConfigDigest, signal }); expect(broken).toBeDefined()
  const invalid = await broken!.evaluate(candidate('{"status":"pending"}')); expect(invalid.status).toBe('unverifiable'); expect(invalid).not.toHaveProperty('failedRequiredConditionDigest')
  writeFileSync(base + '/published-results.json', JSON.stringify({ scope: 'published factory, real executor, five controlled runs; no natural learning evidence',
    pass, fail, injection, frozenFiles, invalid }, null, 2))
}, 120000)
