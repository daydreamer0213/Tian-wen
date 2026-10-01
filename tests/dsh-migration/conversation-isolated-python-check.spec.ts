import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import type { ConversationExternalCodePreparation } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'
import type { ConversationStudyResultPreparation } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'
import { createConversationIsolatedPythonCheck, createConversationStudyIsolatedPythonCheck } from '../../scripts/conversation-isolated-python-check.js'

const mock = vi.hoisted(() => ({ run: vi.fn(), prepare: vi.fn() }))
vi.mock('../../scripts/isolated-python-cli.js', async importOriginal => {
  const original = await importOriginal<typeof import('../../scripts/isolated-python-cli.js')>()
  return { ...original, prepareIsolatedPythonCli: mock.prepare }
})
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.resetAllMocks() })
const condition = 'Return the exact integer successor as JSON with exit code zero and no stderr.'
function fixture() {
  const base = 'D:/DevData/tianwen-isolated-functional-producer-20261001/test-roots'
  mkdirSync(base, { recursive: true }); const cwd = mkdtempSync(join(base, 'producer-')); roots.push(cwd)
  const requestText = `Repair task.py using contract.md. ${condition}`
  const entries = [{ path: 'task.py', content: null }, { path: 'contract.md', content: condition }]
  writeFileSync(join(cwd, 'contract.md'), condition)
  const signal = new AbortController().signal
  const material = { cwd, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: requestText }] })],
    context: [], modelConfigDigest: sha256('model'), signal,
    task: { admission: { decision: { kind: 'task', family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files' } } },
  } as unknown as ConversationExternalCodePreparation
  const config = { cwd, requestText, targetPath: 'task.py', referencePaths: ['contract.md'],
    cases: [{ id: 'large-integer', input: '{"n":9007199254740992}', expectedJson: '{"n":9007199254740993}', exitCode: 0 }],
    isolated: { cliPath: 'D:/unused.exe', endpoint: 'unix:///unused', imageRef: 'python@sha256:' + 'a'.repeat(64),
      imageId: 'sha256:' + 'a'.repeat(64), workRoot: join(cwd, 'receipts') } }
  mock.prepare.mockResolvedValue({ digest: 'b'.repeat(64), run: mock.run })
  mock.run.mockResolvedValue({ status: 'completed', stdout: '{"n":9007199254740993}', stderr: '', exitCode: 0, receiptDigest: 'c'.repeat(64) })
  const candidate = () => ({ request: structuredClone(material.request), context: [], signal, inputs: structuredClone(entries),
    outputs: [{ path: 'task.py', content: 'captured candidate' }, { path: 'contract.md', content: condition }], outputPaths: ['task.py'] })
  const study = { prompt: requestText, criteria: [condition], caseId: 'source1', modelConfigDigest: sha256('model'), signal,
    files: { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd, entries: structuredClone(entries), outputPaths: ['task.py'] },
  } satisfies ConversationStudyResultPreparation
  const studyCandidate = () => { const { caseId: _caseId, modelConfigDigest: _digest, signal: _signal, ...body } = study
    const { request: _request, context: _context, ...output } = candidate()
    return { ...structuredClone(body), ...output, answer: '' } }
  return { cwd, entries, config, material, candidate, study, studyCandidate }
}
it('prepares frozen functional cases and executes only captured output, retaining diagnostic-only default', async () => {
  const f = fixture(), check = createConversationIsolatedPythonCheck(f.config)
  f.config.cases[0]!.expectedJson = '{}'
  const prepared = await check.prepare(f.material)
  expect(prepared).toBeDefined(); expect(prepared!.requiredCondition).toBeUndefined()
  writeFileSync(join(f.cwd, 'task.py'), 'present-day disk must not run')
  expect(await prepared!.evaluate(f.candidate())).toMatchObject({ status: 'verified' })
  expect(mock.run).toHaveBeenCalledWith('captured candidate', '{"n":9007199254740992}', f.material.signal)
})
it.each(['json', 'exit', 'stderr', 'duplicate'] as const)('attributes only complete original functional %s failure', async field => {
  const f = fixture(), prepared = await createConversationIsolatedPythonCheck({ ...f.config, requiredCondition: condition }).prepare(f.material)
  mock.run.mockResolvedValue({ status: 'completed', stdout: field === 'json' ? '{"n":9007199254740992}' : field === 'duplicate' ? '{"n":1,"n":1}' : '{"n":9007199254740993}',
    stderr: field === 'stderr' ? 'error' : '', exitCode: field === 'exit' ? 2 : 0, receiptDigest: 'c'.repeat(64) })
  expect(await prepared!.evaluate(f.candidate())).toMatchObject({ status: 'rejected', failedRequiredConditionDigest: sha256(condition) })
})
it('does not manufacture an original-condition failure for infrastructure or diagnostic-only rejection', async () => {
  const f = fixture(), diagnostic = await createConversationIsolatedPythonCheck(f.config).prepare(f.material)
  mock.run.mockResolvedValue({ status: 'completed', stdout: '{}', stderr: '', exitCode: 0, receiptDigest: 'c'.repeat(64) })
  expect(await diagnostic!.evaluate(f.candidate())).toMatchObject({ status: 'rejected' })
  expect(await diagnostic!.evaluate(f.candidate())).not.toHaveProperty('failedRequiredConditionDigest')
  const required = await createConversationIsolatedPythonCheck({ ...f.config, requiredCondition: condition }).prepare(f.material)
  mock.run.mockResolvedValue({ status: 'unverifiable', detail: 'timeout' })
  expect(await required!.evaluate(f.candidate())).toMatchObject({ status: 'unverifiable' })
  expect(await required!.evaluate(f.candidate())).not.toHaveProperty('failedRequiredConditionDigest')
})
it.each(['input', 'request', 'context', 'missing-reference', 'changed-reference', 'extra-output', 'permission', 'null-source', 'oversize'] as const)('stops %s substitution before execution', async field => {
  const f = fixture(), prepared = await createConversationIsolatedPythonCheck({ ...f.config, requiredCondition: condition }).prepare(f.material), candidate = f.candidate()
  if (field === 'input') candidate.inputs[1]!.content = 'changed'
  if (field === 'request') candidate.request = []
  if (field === 'context') candidate.context = [{}] as typeof candidate.context
  if (field === 'missing-reference') candidate.outputs.pop()
  if (field === 'changed-reference') candidate.outputs[1]!.content = 'changed'
  if (field === 'extra-output') candidate.outputs.push({ path: 'extra.py', content: 'extra' })
  if (field === 'permission') candidate.outputPaths = ['contract.md']
  if (field === 'null-source') candidate.outputs[0]!.content = null as unknown as string
  if (field === 'oversize') candidate.outputs[0]!.content = 'x'.repeat(20481)
  const outcome = await prepared!.evaluate(candidate)
  expect(outcome.status).toBe('unverifiable'); expect(outcome).not.toHaveProperty('failedRequiredConditionDigest'); expect(mock.run).not.toHaveBeenCalled()
})
it('uses saved study input even after its original directory is gone, sharing frozen cases across arms', async () => {
  const f = fixture(), check = createConversationStudyIsolatedPythonCheck({ ...f.config, requiredCondition: condition, criteria: [condition] })
  rmSync(f.cwd, { recursive: true, force: true })
  const prepared = await check.prepare(f.study)
  expect(prepared).toBeDefined()
  mock.run.mockResolvedValueOnce({ status: 'completed', stdout: '{}', stderr: '', exitCode: 0, receiptDigest: 'c'.repeat(64) })
  expect(await prepared!.evaluate(f.studyCandidate())).toMatchObject({ status: 'rejected', failedRequiredConditionDigest: sha256(condition) })
  expect(await prepared!.evaluate(f.studyCandidate())).toMatchObject({ status: 'verified' })
})
it.each(['criteria', 'prompt', 'files', 'quality', 'objective'] as const)('binds the complete study %s body', async field => {
  const f = fixture(), prepared = await createConversationStudyIsolatedPythonCheck({ ...f.config, requiredCondition: condition, criteria: [condition] }).prepare(f.study)
  const candidate = f.studyCandidate()
  if (field === 'criteria') candidate.criteria = ['weakened']
  if (field === 'prompt') candidate.prompt = 'changed'
  if (field === 'files') candidate.files.entries[1]!.content = 'changed'
  if (field === 'quality') Object.assign(candidate, { qualityContract: { invalid: true } })
  if (field === 'objective') { Reflect.deleteProperty(candidate, 'prompt'); Object.assign(candidate, { request: f.material.request, context: [], objective: 'changed' }) }
  expect((await prepared!.evaluate(candidate)).status).toBe('unverifiable'); expect(mock.run).not.toHaveBeenCalled()
})
it('declines mismatched study criteria or a missing readonly input before preparing a runner', async () => {
  const f = fixture(), check = createConversationStudyIsolatedPythonCheck({ ...f.config, requiredCondition: condition, criteria: [condition] })
  expect(await check.prepare({ ...f.study, criteria: ['other'] })).toBeUndefined()
  f.study.files.entries[1]!.content = null as unknown as string
  expect(await check.prepare(f.study)).toBeUndefined(); expect(mock.prepare).not.toHaveBeenCalled()
})
it('binds natural original criteria without requiring the host condition explanation verbatim', async () => {
  const f = fixture(); f.study.criteria = ['用 JSON 返回整数的精确后继，成功退出，不输出错误信息。']
  const check = createConversationStudyIsolatedPythonCheck({ ...f.config, requiredCondition: condition, criteria: [...f.study.criteria] })
  const prepared = await check.prepare(f.study)
  expect(prepared).toBeDefined(); expect((await prepared!.evaluate(f.studyCandidate())).status).toBe('verified')
})
it('propagates cancellation without saving a conclusive functional result', async () => {
  const f = fixture(), prepared = await createConversationIsolatedPythonCheck(f.config).prepare(f.material), controller = new AbortController()
  mock.run.mockImplementationOnce(async () => { controller.abort(); controller.signal.throwIfAborted() })
  await expect(prepared!.evaluate({ ...f.candidate(), signal: controller.signal })).rejects.toThrow()
})
