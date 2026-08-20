import { createHash } from 'node:crypto'
import { Service } from '@tianwen/dsh-compat'
import type {
  Context,
  Session,
  SessionEvent,
} from '@tianwen/dsh-compat'
import type {
  LearningIntakeReceipt,
  Sha256Digest,
} from '@tianwen/evolution'

export interface FeedbackSnapshot {
  readonly messageId: string
  readonly rating: 'positive' | 'negative'
  readonly note?: string
  readonly version: string
}

export interface RuntimeLearningIntakeReceipt extends LearningIntakeReceipt {
  readonly sessionUnchanged: true
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenLearningIntake: TianwenLearningIntakeService
  }
}

function sessionDigest(events: readonly SessionEvent[]): Sha256Digest {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(events), 'utf8')
    .digest('hex')}`
}

function finalAssistant(
  events: readonly SessionEvent[],
): SessionEvent<'assistant/message'> | undefined {
  const turnEnd = events.findLast(candidate => candidate.type === 'turn/end')
  if (turnEnd?.type !== 'turn/end'
    || turnEnd.data.reason.kind !== 'completed') {
    return undefined
  }
  const event = events.findLast(candidate =>
    candidate.type === 'assistant/message'
    && candidate.surfaceOp === 'append'
    && candidate.data.turn === turnEnd.data.turn
    && candidate.seq < turnEnd.seq
    && candidate.data.message.content.length > 0)
  return event?.type === 'assistant/message' ? event : undefined
}

export class TianwenLearningIntakeService extends Service {
  static inject = ['tianwenEvidence', 'tianwenEvolution'] as const

  constructor(ctx: Context) {
    super(ctx, 'tianwenLearningIntake')
  }

  consume(
    session: Session,
    scopeKey: string,
    feedback: FeedbackSnapshot,
  ): RuntimeLearningIntakeReceipt {
    const before = sessionDigest(session.events)
    const finalMessage = finalAssistant(session.events)
    if (finalMessage?.data.message.id !== feedback.messageId) {
      throw new Error(
        'feedback messageId must identify the Session final assistant message',
      )
    }
    const evidenceIds = this.ctx.tianwenEvidence.project(session)
      .map(record => record.evidenceId)
    const receipt = this.ctx.tianwenEvolution.recordLearningIntake({
      sessionId: String(session.id),
      messageId: feedback.messageId,
      feedbackVersion: feedback.version,
      rating: feedback.rating,
      ...(feedback.note === undefined ? {} : { note: feedback.note }),
      scopeKey,
      sessionDigest: before,
      evidenceIds,
    })
    if (sessionDigest(session.events) !== before) {
      throw new Error('learning intake changed the DSH Session')
    }
    return { ...receipt, sessionUnchanged: true }
  }
}
