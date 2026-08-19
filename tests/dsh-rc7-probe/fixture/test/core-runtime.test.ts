import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import GoalService from '@deepseek-ai/dsh-goal'
import {
  createUserMessage,
  LlmAdapter,
  type GenerateOptions,
  type Message,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SqliteSessionQueryEngine from '@deepseek-ai/dsh-session-query-sqlite'

const expectedFinalText = 'RC7_CORE_FINAL'

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: readonly (readonly StreamChunk[])[]) {
    super()
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.script[this.requests.length - 1]
    if (chunks === undefined) throw new Error('ScriptedAdapter: script exhausted')
    yield* chunks
  }
}

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

async function mountHarness(
  sessionRoot: string,
  script: readonly (readonly StreamChunk[])[],
): Promise<{ ctx: Context; adapter: ScriptedAdapter }> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot, compression: 'none' })
  await ctx.plugin(GoalService, {})
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SqliteSessionQueryEngine, { path: ':memory:', openAt: 'never' })
  const adapter = new ScriptedAdapter(script)
  ctx.llm.registerAdapter(['tianwen-probe'], adapter)
  return { ctx, adapter }
}

function finalAssistantText(messages: readonly Message[]): string {
  const last = messages.filter(message => message.role === 'assistant').at(-1)
  assert.ok(last, 'completed request must append an assistant message')
  return last.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

function countJsonlFiles(root: string): number {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
    .length
}

test('rc.7 completes one turn, cold-reads the Session, and resumes a disarmed Goal', async () => {
  const stateBase = process.env.TIANWEN_RC7_STATE_ROOT
  assert.ok(stateBase, 'TIANWEN_RC7_STATE_ROOT is required')
  mkdirSync(stateBase, { recursive: true })
  const sessionRoot = mkdtempSync(join(resolve(stateBase), 'core-runtime-'))
  const sessionId = SessionId('rc7-core-session')
  const first = await mountHarness(sessionRoot, [textResponse('RC7_CORE_FINAL')])

  const created = await first.ctx.agents.create({
    sessionId,
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  const goal = first.ctx.goals.create(created.agent, {
    objective: 'verify the rc.7 public runtime contract',
    maxGoalRounds: 1,
  })
  created.agent.followup(createUserMessage({
    content: [{ type: 'text', text: 'complete the deterministic rc.7 probe' }],
    source: { kind: 'user' },
  }))
  await created.agent.whenIdle()

  const firstEventTypes = created.agent.session.events.map(event => event.type)
  const finalText = finalAssistantText(created.agent.session.deriveMessages())
  assert.equal(finalText, expectedFinalText)
  assert.equal(first.adapter.requests.length, 1)
  assert.equal(goal.activation, 'armed')
  assert.equal(await first.ctx.sessions.flush(created.agent.session), true)
  await first.ctx.fiber.dispose()

  assert.equal(countJsonlFiles(sessionRoot), 1)

  const second = await mountHarness(sessionRoot, [])
  const coldSnapshot = await second.ctx.sessionQuery.readSession(sessionId)
  const coldEventRecords = await second.ctx.sessionQuery.listEvents(sessionId)
  assert.equal(second.ctx.sessions.get(sessionId), undefined)
  assert.deepEqual(coldSnapshot.events.map(event => event.type), firstEventTypes)
  assert.deepEqual(coldEventRecords.map(event => event.type), firstEventTypes)

  const resumed = await second.ctx.agents.resume({
    resumeSessionId: sessionId,
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  await new Promise<void>(done => setImmediate(done))
  await resumed.agent.whenIdle()
  const resumedGoal = second.ctx.goals.get(resumed.agent)

  assert.equal(second.adapter.requests.length, 0)
  assert.equal(resumedGoal?.id, goal.id)
  assert.equal(resumedGoal?.objective, 'verify the rc.7 public runtime contract')
  assert.equal(resumedGoal?.phase, 'active')
  assert.equal(resumedGoal?.roundsStarted, 0)
  assert.equal(resumedGoal?.activation, 'disarmed')
  const resumedEventTypes = resumed.agent.session.events.map(event => event.type)
  assert.deepEqual(resumedEventTypes.slice(0, -1), firstEventTypes)
  assert.equal(resumedEventTypes.at(-1), 'session/end-seed')
  assert.equal(finalAssistantText(resumed.agent.session.deriveMessages()), expectedFinalText)
  await second.ctx.fiber.dispose()
})
