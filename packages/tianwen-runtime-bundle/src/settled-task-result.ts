import type { SessionEvent } from '@deepseek-ai/dsh-session'

export interface SettledTaskResult {
  readonly messageId: string
  readonly text: string
}

export function extractSettledTaskResult(
  events: readonly SessionEvent[],
  goalId: string,
  terminalPhase: 'complete' | 'blocked',
): SettledTaskResult | undefined {
  const goalChange = events.findLast(event =>
    event.type === 'goal/change' &&
    event.data.operation === (terminalPhase === 'complete' ? 'complete' : 'block') &&
    'goal' in event.data &&
    String(event.data.goal.id) === goalId &&
    event.data.goal.phase === terminalPhase)
  if (goalChange?.type !== 'goal/change') return undefined
  const goalInput = events.findLast(event =>
    event.type === 'user/message' &&
    event.seq < goalChange.seq &&
    event.data.source.kind === 'goal' &&
    String(event.data.source.goalId) === goalId)
  if (goalInput?.type !== 'user/message') return undefined
  const turnStart = events.findLast(event =>
    event.type === 'turn/start' && event.seq < goalInput.seq)
  const turnEnd = events.find(event =>
    event.type === 'turn/end' && event.seq > goalInput.seq)
  if (
    turnStart?.type !== 'turn/start' ||
    turnEnd?.type !== 'turn/end' ||
    turnStart.data.turn !== turnEnd.data.turn ||
    turnEnd.data.reason.kind !== 'completed' ||
    events.some(event =>
      event.type === 'turn/start' &&
      event.seq > turnEnd.seq &&
      event.seq < goalChange.seq)
  ) return undefined
  const assistant = events.findLast(event =>
    event.type === 'assistant/message' &&
    event.surfaceOp === 'append' &&
    event.seq > goalInput.seq &&
    event.seq < turnEnd.seq &&
    event.data.turn === turnStart.data.turn)
  if (assistant?.type !== 'assistant/message') return undefined
  const text = assistant.data.message.content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n')
  return text.length === 0
    ? undefined
    : { messageId: String(assistant.data.message.id), text }
}

export async function readSettledTaskResult(
  input: {
    readonly sessionId: string
    readonly goalId: string
    readonly phase: 'complete' | 'abandoned'
  },
  inspect: (sessionId: string) => Promise<{
    readonly meta: { readonly id: unknown }
    readonly events: readonly SessionEvent[]
  }>,
): Promise<string | undefined> {
  const inspection = await inspect(input.sessionId)
  if (String(inspection.meta.id) !== input.sessionId) {
    throw new Error('Settled Task Session identity mismatch')
  }
  return extractSettledTaskResult(
    inspection.events,
    input.goalId,
    input.phase === 'complete' ? 'complete' : 'blocked',
  )?.text
}
