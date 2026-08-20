import { createHash } from 'node:crypto'
import { Service } from '@tianwen/dsh-compat'
import type {
  Context,
  Session,
  SessionEvent,
} from '@tianwen/dsh-compat'
import type {
  LearningIntakeReceipt,
  OutcomeIntakeReceipt,
  RunBindingInput,
  RunBindingReceipt,
  Sha256Digest,
  TianwenRunId,
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

export type RuntimeRunBindingInput = Omit<RunBindingInput, 'sessionId'>

export interface RuntimeRunBindingReceipt extends RunBindingReceipt {
  readonly sessionUnchanged: true
}

export interface RuntimeOutcomeIntakeReceipt extends OutcomeIntakeReceipt {
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

  bindRun(
    session: Session,
    input: RuntimeRunBindingInput,
  ): RuntimeRunBindingReceipt {
    const before = sessionDigest(session.events)
    if (session.events.some(event => event.type === 'turn/start')) {
      throw new Error('Tianwen Run must be bound before the first DSH Turn')
    }
    const receipt = this.ctx.tianwenEvolution.recordRunBinding({
      ...input,
      sessionId: String(session.id),
    })
    if (sessionDigest(session.events) !== before) {
      throw new Error('Run binding changed the DSH Session')
    }
    return { ...receipt, sessionUnchanged: true }
  }

  consumeOutcome(
    session: Session,
    runId: TianwenRunId,
  ): RuntimeOutcomeIntakeReceipt {
    const binding = this.ctx.tianwenEvolution.getRunBinding(runId)
    if (binding === undefined) {
      throw new Error(`unknown Tianwen Run: ${runId}`)
    }
    if (binding.sessionId !== String(session.id)) {
      throw new Error('Tianwen Run is bound to another DSH Session')
    }
    const before = sessionDigest(session.events)
    const finalBoundary = session.events.findLast(event =>
      event.type === 'turn/start' || event.type === 'turn/end')
    if (finalBoundary?.type !== 'turn/end') {
      throw new Error('DSH Session does not have a terminal Turn')
    }
    const matches = this.ctx.tianwenEvidence.project(session)
      .filter(record =>
        record.action.toolName === binding.acceptanceContract.toolName)
      .sort((left, right) => left.source.callSeq - right.source.callSeq)
    const finalEvidence = matches.at(-1)
    const verdict = finalBoundary.data.reason.kind !== 'completed'
      || finalEvidence === undefined
      || finalEvidence.outcome.status === 'missing-result'
      ? 'inconclusive'
      : finalEvidence.outcome.isError === false
          && finalEvidence.outcome.errorCode === undefined
        ? 'met'
        : finalEvidence.outcome.isError === true
            && finalEvidence.outcome.errorCode
            === binding.acceptanceContract.notMetErrorCode
          ? 'not-met'
          : 'inconclusive'

    const receipt = this.ctx.tianwenEvolution.recordOutcomeIntake({
      runId,
      verdict,
      sessionDigest: before,
      evidenceIds: finalEvidence === undefined ? [] : [finalEvidence.evidenceId],
    })
    if (sessionDigest(session.events) !== before) {
      throw new Error('Outcome intake changed the DSH Session')
    }
    return { ...receipt, sessionUnchanged: true }
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
