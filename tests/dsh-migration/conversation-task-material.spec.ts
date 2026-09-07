import { expect, it } from 'vitest'
import { CallId, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { conversationContext, conversationEvidenceTexts } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'

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
    objective: 'derived objective', criteria: ['derived criterion'],
  }
  expect(conversationEvidenceTexts(source, ['current answer'], session.events)).toEqual([
    'original "request"\nwith newline', 'prior source context', 'current answer', 'native tool content',
  ])
})
