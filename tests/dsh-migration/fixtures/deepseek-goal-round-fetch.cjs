'use strict'

const { appendFileSync } = require('node:fs')

const tracePath = process.env.TIANWEN_GOAL_ROUND_FETCH_TRACE
if (typeof tracePath !== 'string' || tracePath.length === 0) {
  throw new Error('missing TIANWEN_GOAL_ROUND_FETCH_TRACE')
}

const endpoint = 'https://api.deepseek.com/chat/completions'
const expectedTools = ['tianwen_smoke_action', 'update_goal']
let requestOrdinal = 0
let goal

function fail(message) {
  throw new Error(`offline DeepSeek fetch rejected: ${message}`)
}

function headersOf(value) {
  return new Headers(value === undefined ? undefined : value)
}

function fixedGoal(body) {
  const systems = body.messages.filter(message => message?.role === 'system' && typeof message.content === 'string')
  const match = systems.map(message => /Current Goal ([^\s]+) revision ([0-9]+)\./u.exec(message.content)).find(Boolean)
  if (match === undefined) fail('missing fixed Goal authority')
  return { id: match[1], revision: Number(match[2]) }
}

function response(payload) {
  return new Response(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function usage(ordinal) {
  return {
    prompt_tokens: 100 + ordinal,
    completion_tokens: 10,
    prompt_cache_hit_tokens: 5,
  }
}

globalThis.fetch = async (url, init = {}) => {
  if (String(url) !== endpoint) fail(`unexpected URL ${String(url)}`)
  if (init.method !== 'POST') fail('unexpected method')
  let body
  try {
    body = JSON.parse(String(init.body))
  } catch {
    fail('invalid JSON request')
  }
  if (body.max_tokens !== 128) fail('unexpected max_tokens')
  requestOrdinal += 1
  if (requestOrdinal > 3) fail('fourth request')
  const toolNames = Array.isArray(body.tools)
    ? body.tools.map(tool => tool?.function?.name).toSorted()
    : []
  const headers = headersOf(init.headers)
  appendFileSync(tracePath, `${JSON.stringify({
    ordinal: requestOrdinal,
    model: body.model,
    max_tokens: body.max_tokens,
    tool_names: toolNames,
    authorization_present: (headers.get('authorization') ?? '').length > 0,
  })}\n`, 'utf8')
  if (body.stream !== true || body.stream_options?.include_usage !== true) fail('streaming usage is required')
  if (JSON.stringify(toolNames) !== JSON.stringify(expectedTools)) fail('unexpected tool list')
  const currentGoal = fixedGoal(body)
  const expectedRevision = [2, 2, 3][requestOrdinal - 1]
  if (currentGoal.revision !== expectedRevision) fail('unexpected Goal revision')
  if (goal === undefined) goal = { id: currentGoal.id, revision: expectedRevision }
  if (goal.id !== currentGoal.id) fail('Goal authority changed')
  if (requestOrdinal === 1) {
    return response({
      choices: [{ delta: { tool_calls: [{ index: 0, id: 'live-action', type: 'function', function: {
        name: 'tianwen_smoke_action', arguments: '{}',
      } }] }, finish_reason: 'tool_calls' }],
      usage: usage(requestOrdinal),
    })
  }
  if (requestOrdinal === 2) {
    return response({
      choices: [{ delta: { tool_calls: [{ index: 0, id: 'live-complete', type: 'function', function: {
        name: 'update_goal', arguments: JSON.stringify({ goal_id: goal.id, revision: goal.revision, action: 'complete' }),
      } }] }, finish_reason: 'tool_calls' }],
      usage: usage(requestOrdinal),
    })
  }
  return response({
    choices: [{ delta: { content: 'TIANWEN_GOAL_ROUND_OK' }, finish_reason: 'stop' }],
    usage: usage(requestOrdinal),
  })
}
