import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import GoalService from '@deepseek-ai/dsh-goal'
import {
  CallId,
  createUserMessage,
  LlmAdapter,
  type ContentBlock,
  type GenerateOptions,
  type Message,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SqliteSessionQueryEngine from '@deepseek-ai/dsh-session-query-sqlite'
import {
  defineTool,
  type PreToolDecision,
} from '@deepseek-ai/dsh-tools'
import ApprovalService from '@deepseek-ai/dsh-user-approval'

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

function toolCallResponse(
  id: string,
  name: string,
  argumentsValue: Record<string, unknown>,
): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call',
        id: CallId(id),
        name,
        arguments: JSON.stringify(argumentsValue),
      },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function finalAssistantText(messages: readonly Message[]): string {
  const last = messages.filter(message => message.role === 'assistant').at(-1)
  assert.ok(last)
  return last.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

function visibleBlock(block: ContentBlock): unknown {
  if (block.type === 'text' || block.type === 'reasoning') {
    return { type: block.type, text: block.text }
  }
  if (block.type === 'tool-call') {
    return {
      type: block.type,
      id: String(block.id),
      name: block.name,
      arguments: block.arguments,
    }
  }
  if (block.type === 'tool-result') {
    return {
      type: block.type,
      toolCallId: String(block.toolCallId),
      isError: block.isError ?? false,
      content: block.content.map(visibleBlock),
    }
  }
  if (block.type === 'image') {
    return { type: block.type, attachment: structuredClone(block.attachment) }
  }
  throw new Error(`unexpected model-visible block: ${(block as { type: string }).type}`)
}

function modelVisibleRequests(requests: readonly GenerateOptions[]): unknown[] {
  return requests.map(request => ({
    provider: request.provider,
    model: request.model,
    system: request.system ?? null,
    messages: request.messages.map(message => ({
      role: message.role,
      content: message.content.map(visibleBlock),
    })),
    tools: (request.tools ?? []).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: structuredClone(tool.parameters),
    })),
  }))
}

function toolFacts(events: readonly SessionEvent[]): unknown[] {
  return events.flatMap<unknown>(event => {
    if (event.type === 'tool/call') {
      return [{
        type: 'call',
        callId: String(event.data.callId),
        name: event.data.name,
        arguments: JSON.parse(event.data.arguments) as unknown,
      }]
    }
    if (event.type === 'tool/result') {
      const block = event.data.message.content[0]
      assert.equal(block?.type, 'tool-result')
      if (block?.type !== 'tool-result') return []
      return [{
        type: 'result',
        callId: String(block.toolCallId),
        isError: block.isError ?? false,
        content: block.content.map(visibleBlock),
      }]
    }
    return []
  })
}

type EvidenceRecord = {
  readonly action: { readonly callId: string; readonly toolName: string }
  readonly outcome: { readonly status: string }
}

type EvidenceProjector = (
  sessionId: string,
  events: readonly unknown[],
) => readonly EvidenceRecord[]

type ExecutionReceipt = {
  readonly userInput: string
  readonly modelVisibleRequests: readonly unknown[]
  readonly toolFacts: readonly unknown[]
  readonly actionLog: readonly string[]
  readonly artifactText: string
  readonly finalText: string
  readonly goal: {
    readonly objective: string
    readonly phase: string
    readonly roundsStarted: number
    readonly activation: string
  }
}

async function runScenario(
  mode: 'off' | 'on',
  userInput: string,
): Promise<{
  execution: ExecutionReceipt
  evidence?: readonly EvidenceRecord[]
  evidenceEvents?: readonly SessionEvent[]
}> {
  const configured = process.env.TIANWEN_RC7_STATE_ROOT
  assert.ok(configured, 'TIANWEN_RC7_STATE_ROOT is required')
  mkdirSync(configured, { recursive: true })
  const sessionRoot = mkdtempSync(join(resolve(configured), `boundary-${mode}-`))
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot, compression: 'none' })
  await ctx.plugin(GoalService, {})
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SqliteSessionQueryEngine, { path: ':memory:', openAt: 'never' })
  const adapter = new ScriptedAdapter([
    toolCallResponse('rc7-action-1', 'artifact_probe', { text: 'RC7_ARTIFACT' }),
    textResponse('RC7_BOUNDARY_FINAL'),
  ])
  ctx.llm.registerAdapter(['tianwen-probe'], adapter)

  const actionLog: string[] = []
  let artifactText = ''
  ctx.tools.register(defineTool({
    name: 'artifact_probe',
    description: 'create one deterministic in-memory artifact',
    parameters: { text: { type: 'string', required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      artifactText = `artifact:${args.text}`
      actionLog.push(`artifact_probe:${args.text}`)
      return `tool-result:${args.text}`
    },
  }))

  const sessionId = SessionId(`rc7-boundary-${mode}`)
  const handle = await ctx.agents.create({
    sessionId,
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  const goal = ctx.goals.create(handle.agent, {
    objective: 'prove Tianwen non-interference over one DSH Session',
    maxGoalRounds: 1,
  })
  handle.agent.followup(createUserMessage({
    content: [{ type: 'text', text: userInput }],
    source: { kind: 'user' },
  }))
  await handle.agent.whenIdle()
  assert.equal(await ctx.sessions.flush(handle.agent.session), true)

  const execution: ExecutionReceipt = {
    userInput,
    modelVisibleRequests: modelVisibleRequests(adapter.requests),
    toolFacts: toolFacts(handle.agent.session.events),
    actionLog,
    artifactText,
    finalText: finalAssistantText(handle.agent.session.deriveMessages()),
    goal: {
      objective: goal.objective,
      phase: goal.phase,
      roundsStarted: goal.roundsStarted,
      activation: goal.activation,
    },
  }

  if (mode === 'off') {
    await ctx.fiber.dispose()
    return { execution }
  }

  const snapshot = await ctx.sessionQuery.readSession(sessionId)
  const entry = process.env.TIANWEN_EVIDENCE_ENTRY
  assert.ok(entry, 'TIANWEN_EVIDENCE_ENTRY is required')
  const evidenceModule = await import(pathToFileURL(entry).href) as {
    projectEvidence: EvidenceProjector
  }
  const evidence = evidenceModule.projectEvidence(String(sessionId), snapshot.events)
  await ctx.fiber.dispose()
  return { execution, evidence, evidenceEvents: snapshot.events }
}

test('LOAD_BEARING Tianwen on projects Evidence after completion without changing DSH execution', async () => {
  const off = await runScenario('off', 'run the deterministic boundary task')
  const on = await runScenario('on', 'run the deterministic boundary task')

  assert.equal(JSON.stringify(on.execution), JSON.stringify(off.execution))
  assert.equal(off.evidence, undefined)
  assert.deepEqual(on.evidence?.map(record => ({
    callId: record.action.callId,
    toolName: record.action.toolName,
    status: record.outcome.status,
  })), [{ callId: 'rc7-action-1', toolName: 'artifact_probe', status: 'complete' }])

  const successfulReceipt = JSON.stringify(on.execution)
  const call = on.evidenceEvents?.find(event => event.type === 'tool/call')
  assert.ok(call)
  const duplicate = structuredClone(call)
  duplicate.seq += 100
  const entry = process.env.TIANWEN_EVIDENCE_ENTRY
  assert.ok(entry)
  const evidenceModule = await import(pathToFileURL(entry).href) as {
    projectEvidence: EvidenceProjector
  }
  assert.throws(
    () => evidenceModule.projectEvidence('rc7-boundary-on', [
      ...(on.evidenceEvents ?? []),
      duplicate,
    ]),
    /duplicate tool\/call/u,
  )
  assert.equal(JSON.stringify(on.execution), successfulReceipt)
})

test('LOAD_BEARING approval policy rejects before the effect and returns feedback to the model', async () => {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(ApprovalService, { policy: 'never' })
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new ScriptedAdapter([
    toolCallResponse('rc7-denied-1', 'effect_probe', {}),
    textResponse('EFFECT_DENIED_FINAL'),
  ])
  ctx.llm.registerAdapter(['tianwen-probe'], adapter)

  let effectExecutions = 0
  ctx.tools.register(defineTool({
    name: 'effect_probe',
    description: 'increment the deterministic effect counter',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      effectExecutions += 1
      return 'EFFECT_EXECUTED'
    },
  }))
  ctx.on('tools/pre-execute', async (_exec, _next): Promise<PreToolDecision> => ({
    kind: 'ask',
    reason: 'rc7 probe effect',
  }))

  const handle = await ctx.agents.create({
    sessionId: SessionId('rc7-effect-denial'),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  handle.agent.followup(createUserMessage({
    content: [{ type: 'text', text: 'attempt the governed effect' }],
    source: { kind: 'user' },
  }))
  await handle.agent.whenIdle()

  const secondRequest = adapter.requests[1]
  assert.ok(secondRequest)
  const nextRequestSawToolError = secondRequest.messages.some(message =>
    message.content.some(block => block.type === 'tool-result' && block.isError === true))
  assert.equal(effectExecutions, 0)
  assert.equal(nextRequestSawToolError, true)
  assert.equal(finalAssistantText(handle.agent.session.deriveMessages()), 'EFFECT_DENIED_FINAL')
  assert.deepEqual(handle.agent.session.events
    .filter(event => event.type.startsWith('approval/'))
    .map(event => event.type), ['approval/asked', 'approval/decided'])
  await ctx.fiber.dispose()
})
