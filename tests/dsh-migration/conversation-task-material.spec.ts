import { expect, it } from 'vitest'
import { CallId, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { conversationContext, conversationEvidenceTexts } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { conversationQualityContract } from '../../packages/tianwen-evolution/src/conversation-learning.js'

it('bounds current-task context to eight earlier direct-user turns without pulling in the current answer', () => {
  const session = Session.create(SessionId('bounded-context'))
  let boundary = 0
  for (let turn = 1; turn <= 10; turn++) {
    const start = session.append('turn/start', { turn })
    if (turn === 10) boundary = start.seq
    session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: `request-${turn}` }] }), { surfaceOp: 'append' })
  }
  const context = conversationContext(session.events, boundary)
  expect(conversationEvidenceTexts({ request: [], context }, [])).toEqual(Array.from({ length: 8 }, (_, index) => `request-${index + 2}`))
})

it('quotes original text and native tool content without exposing judgment or presentation metadata', () => {
  const session = Session.create(SessionId('tool-evidence'))
  const original = session.append('tool/result', {
    turn: 1, step: 1, meta: { note: 'presentation metadata is not evidence' },
    message: createToolResultMessage({ callId: CallId('native-call-identity'), isError: false, content: [{ type: 'text', text: 'native tool content' }] }),
  }, { surfaceOp: 'append' })
  session.append('tool/result', {
    ...original.data,
    message: { ...original.data.message, content: [{ ...original.data.message.content[0], content: [{ type: 'text', text: 'replacement tool content' }] }] },
  }, { surfaceOp: { op: 'replace', start: original.seq, end: original.seq }, sourceEventSeqs: [original.seq] })
  const source = {
    request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'original "request"\nwith newline' }] })],
    context: [{ id: 'context-message-identity', role: 'assistant', content: [{ type: 'text' as const, text: 'prior source context' }, { type: 'reasoning' as const, text: 'internal reasoning' }] }],
    objective: 'derived objective', criteria: ['derived criterion'], qualityContract: conversationQualityContract(),
  }
  expect(conversationEvidenceTexts(source, ['current answer'], session.events)).toEqual([
    'original "request"\nwith newline', 'prior source context', 'current answer', 'native tool content',
  ])
  expect(conversationEvidenceTexts(source, ['current answer'], session.events)).not.toContain(source.qualityContract.criterion)
})

it('projects only surface assistant text from a real native Session while retaining user content and message identities', () => {
  const session = Session.create(SessionId('surface-projection'))
  const start = session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'visible user input' }] }), { surfaceOp: 'append' })
  session.append('assistant/message', {
    turn: 1,
    message: { id: 'answer-1' as never, role: 'assistant', content: [
      { type: 'text', text: 'visible assistant answer' },
      { type: 'reasoning', text: 'hidden-reasoning-'.repeat(8_000) },
      { type: 'tool-call', id: 'native-tool-call' as never, name: 'native_tool', arguments: '{"private":true}' },
    ] },
  }, { surfaceOp: 'append' })
  const boundary = session.append('turn/start', { turn: 2 })
  const projected = (conversationContext as (events: typeof session.events, boundary: number, projection?: 'surface-text.v1') => ReturnType<typeof conversationContext>)(session.events, boundary.seq, 'surface-text.v1')
  const legacy = conversationContext(session.events, boundary.seq)

  expect(Buffer.byteLength(JSON.stringify(legacy), 'utf8')).toBeGreaterThan(96 * 1024)
  expect(legacy[1]?.content.map(block => block.type)).toEqual(['text', 'reasoning', 'tool-call'])
  expect(projected).toEqual([
    { id: expect.any(String), role: 'user', content: [{ type: 'text', text: 'visible user input' }] },
    { id: 'answer-1', role: 'assistant', content: [{ type: 'text', text: 'visible assistant answer' }] },
  ])
  expect(JSON.stringify(projected)).not.toContain('hidden-reasoning-')
  expect(JSON.stringify(projected)).not.toContain('native_tool')
  expect(start.seq).toBeLessThan(boundary.seq)
})
