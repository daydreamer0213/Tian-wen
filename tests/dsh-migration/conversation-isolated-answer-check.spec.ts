import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { createConversationStudyIsolatedPythonAnswerCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-isolated-answer-check.js'

const mock = vi.hoisted(() => ({ run: vi.fn(), prepare: vi.fn() }))
vi.mock('../../packages/tianwen-runtime-bundle/src/isolated-python-cli.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../packages/tianwen-runtime-bundle/src/isolated-python-cli.js')>(), prepareIsolatedPythonCli: mock.prepare,
}))
const base = 'D:/DevData/tianwen-isolated-answer-check-20261004/test-roots', roots: string[] = []
const condition = 'Return exactly the original pending status as JSON.'
const verifierSource = 'import json,sys\np=json.load(sys.stdin)\nprint(json.dumps(json.loads(p["answer"])=={"status":"pending"}))'
beforeEach(() => { mock.prepare.mockResolvedValue({ digest: 'a'.repeat(64), run: mock.run })
  mock.run.mockResolvedValue({ status: 'completed', stdout: 'true\n', stderr: '', exitCode: 0, receiptDigest: 'b'.repeat(64) }) })
afterEach(() => { for (const root of roots.splice(0)) {
  expect(realpathSync(root).replaceAll('\\', '/').startsWith(realpathSync(base).replaceAll('\\', '/') + '/')).toBe(true)
  rmSync(root, { recursive: true, force: true })
} vi.resetAllMocks() })
function fixture(fileChat = false) {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'answer-')); roots.push(root)
  const material = { prompt: 'Original record: pending. Return its status.', criteria: [condition], ...(fileChat ? {
    files: { schemaVersion: 'tianwen.conversation-file-material.v1' as const, cwd: root, entries: [{ path: 'record.md', content: 'pending' }], outputPaths: [], outputKind: 'chat' as const },
  } : {}) }
  const config = { modelConfigDigest: sha256('model'), cases: [{ caseId: 'source1', material, requiredCondition: condition, verifierSource }],
    isolated: { cliPath: 'D:/unused.exe', endpoint: 'unix:///unused', imageRef: 'python@sha256:' + 'a'.repeat(64),
      imageId: 'sha256:' + 'a'.repeat(64), workRoot: root } }
  const input = { material: structuredClone(material), caseId: 'source1', modelConfigDigest: config.modelConfigDigest, signal: new AbortController().signal }
  const candidate = () => ({ material: structuredClone(material), answer: '{"status":"pending"}', files: structuredClone(material.files?.entries ?? []), signal: input.signal })
  return { root, material, config, input, candidate }
}
it('executes only frozen host verifier source with answer as JSON data and preserves receipts', async () => {
  const f = fixture(), check = createConversationStudyIsolatedPythonAnswerCheck(f.config), prepared = await check.prepare(f.input)
  expect(prepared?.waitsForCancellationCleanup).toBe(true); expect(prepared?.inputsDigest).toBe(sha256(f.material))
  const candidate = { ...f.candidate(), answer: 'print("unsafe answer must stay data")' }
  expect(await prepared!.evaluate(candidate)).toMatchObject({ status: 'verified' })
  expect(mock.run).toHaveBeenCalledOnce(); const [source, packet] = mock.run.mock.calls[0]!
  expect(source).toBe(verifierSource); expect(JSON.parse(packet)).toEqual({ schemaVersion: 'tianwen.answer-check.v1', material: f.material, answer: candidate.answer, files: [] })
  const result = readdirSync(f.root).find(path => path.startsWith('result-'))!
  expect(JSON.parse(readFileSync(join(f.root, result), 'utf8'))).toMatchObject({ status: 'verified', packetDigest: sha256(packet), receiptDigest: 'b'.repeat(64) })
})
it('attributes only a completed boolean false to the original fixed condition', async () => {
  const f = fixture(), prepared = await createConversationStudyIsolatedPythonAnswerCheck(f.config).prepare(f.input)
  mock.run.mockResolvedValue({ status: 'completed', stdout: 'false', stderr: '', exitCode: 0, receiptDigest: 'b'.repeat(64) })
  expect(await prepared!.evaluate(f.candidate())).toMatchObject({ status: 'rejected', failedRequiredConditionDigest: sha256(condition) })
})
it.each(['invalid', 'object', 'number', 'stderr', 'exit', 'infra'] as const)('does not manufacture task failure for %s verifier failure', async field => {
  const f = fixture(), prepared = await createConversationStudyIsolatedPythonAnswerCheck(f.config).prepare(f.input)
  mock.run.mockResolvedValue(field === 'infra' ? { status: 'unverifiable', detail: 'engine stopped' } : {
    status: 'completed', stdout: field === 'invalid' ? 'true false' : field === 'object' ? '{"ok":false}' : field === 'number' ? '0' : 'false',
    stderr: field === 'stderr' ? 'exception' : '', exitCode: field === 'exit' ? 1 : 0, receiptDigest: 'b'.repeat(64),
  })
  const result = await prepared!.evaluate(f.candidate()); expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})
it.each(['criteria', 'prompt', 'case', 'model'] as const)('refuses pre-answer %s substitution', async field => {
  const f = fixture(); const check = createConversationStudyIsolatedPythonAnswerCheck(f.config)
  if (field === 'criteria') f.input.material.criteria = ['replacement']
  if (field === 'prompt') f.input.material.prompt += ' drift'
  if (field === 'case') f.input.caseId = 'candidate'
  if (field === 'model') f.input.modelConfigDigest = sha256('replacement')
  expect(await check.prepare(f.input)).toBeUndefined(); expect(mock.prepare).not.toHaveBeenCalled()
})
it.each(['material', 'file', 'extra-file', 'oversize', 'manifest'] as const)('rejects %s drift without execution or task-failure attribution', async field => {
  const f = fixture(true), prepared = await createConversationStudyIsolatedPythonAnswerCheck(f.config).prepare(f.input), candidate = f.candidate()
  if (field === 'material') candidate.material.prompt += ' drift'
  if (field === 'file') candidate.files[0]!.content = 'failed'
  if (field === 'extra-file') candidate.files.push({ path: 'extra.md', content: 'pending' })
  if (field === 'oversize') candidate.answer = 'x'.repeat(32769)
  if (field === 'manifest') writeFileSync(join(f.root, readdirSync(f.root).find(path => path.startsWith('contract-'))!), '{}')
  expect(await prepared!.evaluate(candidate)).toMatchObject({ status: 'unverifiable' }); expect(mock.run).not.toHaveBeenCalled()
})
it('freezes caller configuration and uses captured chat files rather than current workspace bytes', async () => {
  const f = fixture(true), check = createConversationStudyIsolatedPythonAnswerCheck(f.config)
  f.config.cases[0]!.verifierSource = 'print(false)'; f.config.cases[0]!.requiredCondition = 'replacement'
  f.config.isolated.imageId = 'sha256:' + 'c'.repeat(64)
  writeFileSync(join(f.root, 'record.md'), 'today changed')
  const prepared = await check.prepare(f.input)
  expect(await prepared!.evaluate(f.candidate())).toMatchObject({ status: 'verified' })
  expect(mock.run.mock.calls[0]![0]).toBe(verifierSource)
  expect(JSON.parse(mock.run.mock.calls[0]![1]).files).toEqual([{ path: 'record.md', content: 'pending' }])
  expect(prepared!.requiredCondition).toBe(condition)
})
it('stops oversized complete input before engine preparation and does not truncate', async () => {
  const f = fixture(); f.config.cases[0]!.material.prompt = 'x'.repeat(32769)
  expect(() => createConversationStudyIsolatedPythonAnswerCheck(f.config)).toThrow(); expect(mock.prepare).not.toHaveBeenCalled()
})
it('propagates cancellation after owned isolated cleanup instead of returning a failure', async () => {
  const f = fixture(), prepared = await createConversationStudyIsolatedPythonAnswerCheck(f.config).prepare(f.input), controller = new AbortController()
  let finish!: () => void; mock.run.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ status: 'unverifiable', detail: 'cleaned cancellation' }) }))
  const evaluation = prepared!.evaluate({ ...f.candidate(), signal: controller.signal })
  controller.abort(); let settled = false; void evaluation.then(() => { settled = true }, () => { settled = true })
  await Promise.resolve(); expect(settled).toBe(false); finish(); await expect(evaluation).rejects.toThrow()
})
it('rejects ambiguous or absent host contracts without touching the engine', () => {
  const f = fixture()
  expect(() => createConversationStudyIsolatedPythonAnswerCheck({ ...f.config, cases: [] })).toThrow()
  expect(() => createConversationStudyIsolatedPythonAnswerCheck({ ...f.config, cases: [f.config.cases[0]!, f.config.cases[0]!] })).toThrow()
  expect(() => createConversationStudyIsolatedPythonAnswerCheck({ ...f.config, cases: [{ ...f.config.cases[0]!, requiredCondition: '' }] })).toThrow()
  expect(mock.prepare).not.toHaveBeenCalled()
})
