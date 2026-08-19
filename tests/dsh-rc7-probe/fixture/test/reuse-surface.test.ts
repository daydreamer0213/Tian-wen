import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import MessageFeedbackService from '@deepseek-ai/dsh-message-feedback'
import PermissionPresetService from '@deepseek-ai/dsh-permission-presets'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SubagentRuntime, { type SubagentProvider } from '@deepseek-ai/dsh-subagent'
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import WorkerThreadWorkflowEngine from '@deepseek-ai/dsh-workflow-worker-thread'

function freshStateRoot(label: string): string {
  const configured = process.env.TIANWEN_RC7_STATE_ROOT
  assert.ok(configured, 'TIANWEN_RC7_STATE_ROOT is required')
  mkdirSync(configured, { recursive: true })
  return mkdtempSync(join(resolve(configured), `${label}-`))
}

test('LOAD_BEARING Skill provider, catalog, and public model loader expose one real skill', async () => {
  const root = freshStateRoot('skill')
  const skillsRoot = join(root, 'skills')
  const skillDirectory = join(skillsRoot, 'probe-skill')
  mkdirSync(skillDirectory, { recursive: true })
  writeFileSync(join(skillDirectory, 'SKILL.md'), [
    '---',
    'name: probe-skill',
    'description: Deterministic rc.7 compatibility skill',
    '---',
    '',
    'RC7_SKILL_BODY',
    '',
  ].join('\n'))

  const ctx = new Context()
  await ctx.plugin(SkillRegistry, {})
  await ctx.plugin(SkillFilesystem, {
    includeDefaultRoots: false,
    customSkillDirs: [skillsRoot],
    watch: false,
  })

  assert.deepEqual((await ctx.skills.list({ cwd: skillsRoot })).map(skill => skill.name), [
    'probe-skill',
  ])
  const loaded = await ctx.skills.get('probe-skill', { cwd: skillsRoot })
  assert.ok(loaded)
  assert.match(loaded.content, /RC7_SKILL_BODY/u)
  assert.equal(ToolSkill.name, 'tool-skill')
  assert.equal(typeof ToolSkill.apply, 'function')
  await ctx.fiber.dispose()
})

test('OPTIONAL_REUSE Local Jobs completes start, wait, and read through the public registry', async () => {
  const ctx = new Context()
  await ctx.plugin(LocalJobRegistry, {})
  ctx.jobs.attachController('rc7-probe')
  const id = ctx.jobs.start({
    kind: 'bash',
    label: 'rc7-probe',
    run: () => ({
      cancel() {},
      done: Promise.resolve({ status: 'completed', output: 'JOB_OK' }),
      readOutput: () => 'JOB_OK',
    }),
  })

  assert.equal((await ctx.jobs.wait(id, 1_000)).status, 'completed')
  assert.equal(ctx.jobs.read(id).text, 'JOB_OK')
  await ctx.fiber.dispose()
})

test('OPTIONAL_REUSE worker-thread Workflow executes a keyless public script', { timeout: 30_000 }, async () => {
  const ctx = new Context()
  const subagents = await ctx.plugin(SubagentRuntime)
  const provider: SubagentProvider = {
    name: 'spawn',
    capabilities: { outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
    inheritsParentContext: false,
    start: () => Promise.reject(new Error('rc7 probe workflow must not start a child')),
  }
  ctx.subagents.registerProvider(provider)
  const engine = await ctx.plugin(WorkerThreadWorkflowEngine, {})
  const parent = { id: SessionId('rc7-workflow-parent'), options: {} } as unknown as Agent

  try {
    const run = ctx.workflowEngine.start({
      script: 'return 6 * 7',
      meta: { name: 'rc7-probe', description: 'keyless worker-thread compatibility' },
      parent,
    })
    try {
      assert.deepEqual(await run.result, {
        value: 42,
        stopReason: 'completed',
        agentsStarted: 0,
      })
    } finally {
      await run.dispose()
    }
  } finally {
    await engine.dispose()
    await subagents.dispose()
  }
})

test('OPTIONAL_REUSE Message Feedback persists one finalized assistant rating', async () => {
  const root = freshStateRoot('message-feedback')
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(root, 'storage') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(MessageFeedbackService, { maxNoteBytes: 64 })

  const session = ctx.sessions.create(SessionId('rc7-feedback-session'))
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  const assistant = createAssistantMessage({
    content: [{ type: 'text', text: 'RC7_FEEDBACK_TARGET' }],
    source: { provider: 'tianwen-probe', model: 'scripted' },
  })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: assistant,
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.equal(await ctx.sessions.flush(session), true)

  const put = await ctx.messageFeedback.put({
    sessionId: session.id,
    messageId: assistant.id,
    rating: 'positive',
    ifVersion: null,
  })
  assert.equal(put.ok, true)
  const listed = await ctx.messageFeedback.list({ sessionId: session.id })
  if (!listed.ok) throw new Error(`unexpected feedback error: ${listed.error.code}`)
  assert.deepEqual(listed.value.items.map(item => ({
    messageId: item.messageId,
    rating: item.rating,
  })), [{ messageId: assistant.id, rating: 'positive' }])
  assert.equal(typeof ApprovalService, 'function')
  assert.equal(typeof PermissionPresetService, 'function')
  await ctx.fiber.dispose()
})
