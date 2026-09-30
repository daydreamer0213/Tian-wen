// One prospective engineering task. No learning loop, feedback synthesis or activation.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mountPersistentHarness, SessionId } from '../packages/tianwen-dsh-compat/src/index.ts'
import { runConversationFileTrial, recoverConversationFileTrial } from '../packages/tianwen-runtime-bundle/src/conversation-file-trial.ts'
import { sha256 } from '../packages/tianwen-evolution/src/index.ts'
import { prepareConversationTrialTypecheck } from './receipt-test-contract.ts'

assert.deepEqual(process.argv.slice(2), ['--run'], 'Explicit --run required; no import-time model call')
const repo = resolve(import.meta.dirname, '..')
const root = 'D:/DevData/tianwen-test-typecheck-contract-20260930/native-attempt'
const target = 'tests/dsh-migration/conversation-file-trial.spec.ts'
const hash = value => createHash('sha256').update(value).digest('hex')
mkdirSync(root, { recursive: true })
assert(!existsSync(`${root}/attempt-started.json`), 'Do not retry this actual task')
const require = createRequire(`${repo}/package.json`)
const cli = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))
const base = createRequire(cli.resolve('@deepseek-ai/dsh-base/package.json'))
const moduleAt = async (resolver, name) => import(pathToFileURL(resolver.resolve(name)).href)
const contract = prepareConversationTrialTypecheck(repo)
const { check, capturedText, ...contractSummary } = contract
const source = capturedText(`${repo}/${target}`)
assert.equal(hash(JSON.stringify(source)), contract.originalDigest)
const policy = base.resolve('@deepseek-ai/dsh-sandbox-policy')
const material = {
  prompt: `完成天问现有文件试验测试的严格类型修复。目标文件 ${target}。
统一源码检查并加载官方沙箱类型后，现有错误：冷恢复 retained 的 unknown 类型不能传给恢复函数；两处用户模式事件的 source:'user' 不符合官方接口。
要求：冷恢复 retained 使用已有 ConversationFileTrialReceipt 接口，可用类型导入或已有 API 推导；用户模式事件遵循官方 setSandboxMode 形状（仅 mode）。保持其余原有类型、执行逻辑、模式值和全部测试断言。
只编辑目标文件；不得增加强转、替代接口、检查屏蔽注释或运行命令。参考文件只作已有类型/API 依据。输出完整修改后的目标文件，最后简短说明修改。独立编译器在完成后检查；你不能运行或改变检查器。`,
  files: { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd: repo,
    entries: [{ path: target, content: source },
      { path: 'packages/tianwen-runtime-bundle/src/conversation-file-trial.ts', content: capturedText(`${repo}/packages/tianwen-runtime-bundle/src/conversation-file-trial.ts`) },
      { path: 'packages/tianwen-evolution/src/conversation-files.ts', content: capturedText(`${repo}/packages/tianwen-evolution/src/conversation-files.ts`) },
      { path: 'reference/sandbox-session-mode.d.ts', content: capturedText(join(dirname(policy), 'types/session-mode.d.ts')) }], outputPaths: [target] },
}
assert.equal(Buffer.byteLength(JSON.stringify(material), 'utf8') <= 96 * 1024, true)
mkdirSync(`${root}/replicas`, { recursive: true })
const harness = await mountPersistentHarness(`${root}/sessions`, [])
let parent; let modelRequests = 0; let started = false
const abort = new AbortController()
const timer = setTimeout(() => abort.abort(), 480_000)
const save = (name, value) => writeFileSync(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' })
try {
  await harness.ctx.plugin((await moduleAt(base, '@deepseek-ai/dsh-llm-deepseek')), {
    maxTokens: 8192, reasoningEffort: 'high', retryPolicy: { mode: 'normal', maxRetries: 0 }, streamIdleTimeoutMs: 90_000,
  })
  await harness.ctx.plugin((await moduleAt(cli, '@deepseek-ai/dsh-fs-local')).default, { cwd: root })
  await harness.ctx.plugin((await moduleAt(cli, '@deepseek-ai/dsh-tool-fs')), {})
  const callConfig = await harness.ctx.llm.resolveCallConfig({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high', maxTokens: 8192 })
  assert.deepEqual(callConfig, { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high', maxTokens: 8192 })
  harness.ctx.on('llm/stream', async function* (request, next) {
    assert.equal(request.provider, callConfig.provider); assert.equal(request.model, callConfig.model)
    assert(++modelRequests <= 8, 'request bound exceeded')
    console.log(`native-model-request ${modelRequests}`)
    yield* next()
  })
  parent = await harness.ctx.agents.create({ sessionId: SessionId(`receipt-contract-parent-${Date.now()}`),
    meta: { cwd: root }, agentOptions: callConfig })
  save('attempt-started', { at: new Date().toISOString(), selectedTaskBaselineCommit: 'c0afdaab670b14c101075abca3c867ced8ab2886',
    contract: contractSummary, material, materialDigest: sha256(material), callConfig,
    checkerDriverDigest: hash(readFileSync(import.meta.filename)), scope: 'Single selected pending project task; no automatic learning qualification.' })
  started = true
  const result = await runConversationFileTrial(harness.ctx, parent.agent, { label: 'Tianwen actual receipt/sandbox fixture type repair',
    material, callConfig, signal: abort.signal, replicaParent: `${root}/replicas`, retainReceipt: receipt => save('native-receipt', receipt) })
  // Recover from the durable exact receipt and native Session before looking at any candidate.
  const receipt = JSON.parse(readFileSync(`${root}/native-receipt.json`, 'utf8'))
  const recovered = await recoverConversationFileTrial(harness.ctx, result.proof, { receipt, material, callConfig, outputDigest: result.outputDigest })
  assert.deepEqual(recovered, { answer: result.answer, files: result.files, outputDigest: result.outputDigest })
  assert.equal(harness.adapter.requests.length, 0, 'scripted adapter must not produce this output')
  for (const entry of material.files.entries.filter(entry => entry.path !== target)) {
    assert.deepEqual(recovered.files.find(file => file.path === entry.path), entry)
  }
  const candidate = recovered.files.find(file => file.path === target)
  assert.equal(typeof candidate?.content, 'string')
  const verification = check(candidate.content)
  save('result', { at: new Date().toISOString(), verification, nativeProof: result.proof, nativeOutputDigest: result.outputDigest,
    nativeReceiptDigest: sha256(receipt), materialDigest: sha256(material), callConfig, modelRequests,
    automaticLearningQualification: 'unestablished', appliedToProject: false })
  console.log(`independent-task-check ${verification.status}`)
} catch (error) {
  save('failure', { at: new Date().toISOString(), started, modelRequests, error: { name: error.name, message: error.message } })
  console.log(`attempt-failed ${error.name}: ${error.message}`); process.exitCode = 1
} finally {
  clearTimeout(timer); abort.abort()
  const cleanupErrors = []
  try { await parent?.dispose() } catch (error) { cleanupErrors.push({ stage: 'parent', name: error.name, message: error.message }) }
  try { await harness.ctx.fiber.dispose() } catch (error) { cleanupErrors.push({ stage: 'harness', name: error.name, message: error.message }) }
  save('cleanup', { at: new Date().toISOString(), replicasRemaining: readdirSync(`${root}/replicas`), modelRequests, cleanupErrors })
  if (cleanupErrors.length > 0) process.exitCode = 1
}
