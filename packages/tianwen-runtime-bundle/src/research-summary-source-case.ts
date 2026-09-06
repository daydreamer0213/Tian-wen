import { createHash } from 'node:crypto'

import { SessionId, type Context, type SessionEvent } from '@tianwen/dsh-compat'
import {
  learningSessionLifecycleFingerprint,
  sha256,
  type ControlledSkillSourceIdentity,
  type LearningAnalysisBinding,
  type LearningSignalStatus,
  type OutcomeLearningSignal,
} from '@tianwen/evolution'
import {
  normalizeResearchSummarySubmission,
  RESEARCH_SUMMARY_SCOPE,
  RESEARCH_SUMMARY_TOOL_NAME,
  type ResearchPacket,
  type ResearchSummarySubmission,
} from '@tianwen/runtime'

import { researchSummaryPacketFromEvents } from './research-summary-admission.js'

export interface ResearchSummarySourceCase {
  readonly source: ControlledSkillSourceIdentity
  readonly packet: ResearchPacket
  readonly submission: ResearchSummarySubmission
  readonly targetTurn: number
  readonly acceptanceEvidenceId: `sha256:${string}`
}

export type ResearchSummaryFeedbackSourceBinding = Extract<
  LearningAnalysisBinding,
  { readonly source?: undefined }
>

export type ResearchSummaryOutcomeSourceBinding = Extract<
  LearningAnalysisBinding,
  { readonly source: 'outcome' }
>

function frozenEvents(
  events: readonly SessionEvent[],
  expectedDigest: string,
): readonly SessionEvent[] {
  const matches: (readonly SessionEvent[])[] = []
  const hash = createHash('sha256').update('[', 'utf8')
  for (let index = 0; index < events.length; index += 1) {
    if (index > 0) hash.update(',', 'utf8')
    hash.update(JSON.stringify(events[index]), 'utf8')
    const digest = `sha256:${hash.copy().update(']', 'utf8').digest('hex')}`
    if (digest === expectedDigest) matches.push(events.slice(0, index + 1))
  }
  if (matches.length !== 1) {
    throw new Error('research summary feedback snapshot is unavailable or ambiguous')
  }
  return matches[0]!
}

function acceptedResultSubmission(
  packet: ResearchPacket,
  result: SessionEvent<'tool/result'>,
): ResearchSummarySubmission {
  const block = result.data.message.content[0]
  if (block?.type !== 'tool-result' || block.isError === true
    || block.content.length !== 1 || block.content[0]?.type !== 'text') {
    throw new Error('research summary accepted result is unavailable')
  }
  let value: unknown
  try {
    value = JSON.parse(block.content[0].text) as unknown
  } catch {
    throw new Error('research summary accepted result is malformed')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !Object.hasOwn(value, 'submission')) {
    throw new Error('research summary accepted result has no canonical submission')
  }
  return normalizeResearchSummarySubmission(
    packet,
    (value as { readonly submission: unknown }).submission,
  )
}

/** Recover only the native source frozen by the exact explicit-feedback revision. */
export async function recoverResearchSummarySourceCase(
  ctx: Context,
  status: ResearchSummaryFeedbackSourceBinding,
): Promise<ResearchSummarySourceCase> {
  const intake = ctx.tianwenEvolution.getLearningIntakeStatus(
    status.sessionId,
    status.messageId,
  )
  const ticket = ctx.tianwenEvolution.listLearningTickets()
    .find(value => value.ticketId === status.ticketId)
  const signals = ctx.tianwenEvolution.listLearningSignals().filter(
    (signal): signal is LearningSignalStatus => !('runId' in signal)
    && signal.active
    && signal.sessionId === status.sessionId
    && signal.messageId === status.messageId
    && signal.feedbackVersion === status.feedbackVersion
    && ticket?.signalIds.includes(signal.signalId) === true,
  )
  const signal = signals.length === 1 ? signals[0]! : undefined
  const binding = ctx.tianwenEvolution.getRunBindingBySessionId(status.sessionId)
  const use = binding === undefined
    ? undefined
    : ctx.tianwenEvolution.getRunSkillUse(binding.runId)
  if (
    status.parentSessionId !== status.sessionId
    || intake?.state !== 'active'
    || intake.sessionId !== status.sessionId
    || intake.messageId !== status.messageId
    || intake.rating !== 'negative'
    || intake.ticketId !== status.ticketId
    || intake.feedbackVersion !== status.feedbackVersion
    || intake.analysisConsentRevision !== status.consentRevision
    || intake.scopeKey !== RESEARCH_SUMMARY_SCOPE
    || ticket?.status !== 'open'
    || signal === undefined
    || signal.signalId !== intake.signalId
    || signal.ingestionId !== intake.ingestionId
    || signal.scopeKey !== RESEARCH_SUMMARY_SCOPE
    || binding?.schemaVersion !== 'tianwen.run-binding.v3'
    || binding.sessionId !== status.sessionId
    || binding.scopeKey !== RESEARCH_SUMMARY_SCOPE
    || binding.acceptanceContract.toolName !== RESEARCH_SUMMARY_TOOL_NAME
    || binding.acceptanceSubjectDigest === undefined
    || use?.sessionId !== status.sessionId
    || use?.sessionDigest !== signal.sessionDigest
    || (use !== undefined && !signal.evidenceIds.includes(use.acceptanceEvidenceId))
  ) throw new Error('research summary feedback source binding is unavailable')
  if (use === undefined) throw new Error('research summary feedback source use is unavailable')

  const inspection = await ctx.sessionPersistence.inspect(SessionId(status.sessionId))
  const lifecycle = learningSessionLifecycleFingerprint({
    sessionId: String(inspection.meta.id),
    createdAt: inspection.meta.createdAt,
    ...(inspection.meta.cwd === undefined ? {} : { cwd: inspection.meta.cwd }),
  })
  if (
    String(inspection.meta.id) !== status.sessionId
    || inspection.meta.parentSession !== undefined
    || inspection.meta.origin === 'subagent'
    || intake.sessionLifecycleFingerprint !== lifecycle
    || binding.sessionLifecycleFingerprint !== lifecycle
  ) throw new Error('research summary feedback source Session identity is unavailable')

  const events = frozenEvents(inspection.events, signal.sessionDigest)
  const evidence = ctx.tianwenEvidence.project({ id: inspection.meta.id, events } as never)
  if (sha256(evidence.map(item => item.evidenceId)) !== sha256(signal.evidenceIds)) {
    throw new Error('research summary feedback evidence snapshot changed')
  }
  const accepted = evidence.filter(item =>
    item.evidenceId === use.acceptanceEvidenceId
    && item.action.toolName === RESEARCH_SUMMARY_TOOL_NAME
    && item.outcome.status === 'complete'
    && item.outcome.isError === false
    && item.outcome.errorCode === undefined)
  if (accepted.length !== 1 || accepted[0]!.source.resultSeq === undefined) {
    throw new Error('research summary accepted evidence is unavailable or ambiguous')
  }

  const packet = researchSummaryPacketFromEvents(
    events as Parameters<typeof researchSummaryPacketFromEvents>[0],
    binding.acceptanceSubjectDigest,
  )?.packet
  const target = events.filter((event): event is SessionEvent<'assistant/message'> =>
    event.type === 'assistant/message'
    && event.surfaceOp === 'append'
    && String(event.data.message.id) === status.messageId)
  if (packet === undefined || target.length !== 1) {
    throw new Error('research summary packet or feedback target is unavailable or ambiguous')
  }
  const targetTurn = target[0]!.data.turn
  const starts = events.filter((event): event is SessionEvent<'turn/start'> =>
    event.type === 'turn/start'
    && event.data.turn === targetTurn
    && event.seq < target[0]!.seq)
  const ends = events.filter((event): event is SessionEvent<'turn/end'> =>
    event.type === 'turn/end'
    && event.data.turn === targetTurn
    && event.seq > target[0]!.seq
    && event.data.reason.kind === 'completed')
  const call = events.find(event => event.seq === accepted[0]!.source.callSeq)
  const result = events.find(event => event.seq === accepted[0]!.source.resultSeq)
  if (
    !Number.isInteger(targetTurn)
    || starts.length !== 1
    || ends.length !== 1
    || call?.type !== 'tool/call'
    || result?.type !== 'tool/result'
    || call.data.name !== RESEARCH_SUMMARY_TOOL_NAME
    || call.data.turn !== targetTurn
    || result.data.turn !== targetTurn
    || !(starts[0]!.seq < call.seq
      && call.seq < result.seq
      && result.seq < target[0]!.seq
      && target[0]!.seq < ends[0]!.seq)
  ) throw new Error('research summary feedback target turn or accepted evidence is invalid')

  let submitted: ResearchSummarySubmission
  try {
    submitted = normalizeResearchSummarySubmission(
      packet,
      JSON.parse(call.data.arguments) as unknown,
    )
  } catch {
    throw new Error('research summary accepted call is not a canonical submission')
  }
  if (sha256(submitted) !== sha256(acceptedResultSubmission(packet, result))) {
    throw new Error('research summary accepted call and result disagree')
  }

  return Object.freeze({
    source: Object.freeze({
      signalId: signal.signalId,
      sessionId: signal.sessionId,
      messageId: signal.messageId,
      feedbackVersion: signal.feedbackVersion,
      sessionLifecycleFingerprint: lifecycle,
      sessionDigest: signal.sessionDigest,
      evidenceSetDigest: sha256(signal.evidenceIds),
      acceptanceSubjectDigest: binding.acceptanceSubjectDigest,
      packetDigest: sha256(packet.source),
    }),
    packet,
    submission: submitted,
    targetTurn,
    acceptanceEvidenceId: use.acceptanceEvidenceId,
  })
}

/** Recover the deterministic first failed semantic Outcome frozen by its analysis. */
export async function recoverOutcomeResearchSummarySourceCase(
  ctx: Context,
  status: ResearchSummaryOutcomeSourceBinding,
): Promise<ResearchSummarySourceCase> {
  const sourceSignalId = [...status.signalIds].sort()[0]
  const ticket = ctx.tianwenEvolution.listLearningTickets()
    .find(value => value.ticketId === status.ticketId)
  const signal = ctx.tianwenEvolution.listLearningSignals()
    .filter((value): value is OutcomeLearningSignal => 'runId' in value)
    .find(value => value.signalId === sourceSignalId
      && ticket?.signalIds.includes(value.signalId) === true)
  const binding = signal === undefined
    ? undefined
    : ctx.tianwenEvolution.getRunBinding(signal.runId)
  const outcome = signal === undefined
    ? undefined
    : ctx.tianwenEvolution.getOutcomeIntake(signal.runId)
  const use = signal === undefined
    ? undefined
    : ctx.tianwenEvolution.getRunSkillUse(signal.runId)
  if (
    sourceSignalId === undefined
    || status.parentSessionId !== status.sessionId
    || ticket?.status !== 'open'
    || signal === undefined
    || binding?.schemaVersion !== 'tianwen.run-binding.v3'
    || binding.sessionId !== signal.sessionId
    || binding.scopeKey !== RESEARCH_SUMMARY_SCOPE
    || binding.acceptanceContract.toolName !== RESEARCH_SUMMARY_TOOL_NAME
    || binding.acceptanceContract.gapDisposition !== 'reusable'
    || !binding.acceptanceContract.problemCategory.startsWith('research-summary-result.v2:')
    || binding.acceptanceContract.qualityContract?.schemaVersion
      !== 'tianwen.research-summary-semantic-contract.v1'
    || binding.acceptanceSubjectDigest === undefined
    || outcome?.schemaVersion !== 'tianwen.outcome-intake.v2'
    || outcome.receipt.ingestionId !== signal.ingestionId
    || outcome.input.verdict !== 'not-met'
    || outcome.input.semanticReview.status !== 'completed'
    || outcome.input.semanticReview.acceptanceSubjectDigest
      !== binding.acceptanceSubjectDigest
    || outcome.input.semanticReview.rubricDigest
      !== binding.acceptanceContract.qualityContract.rubricDigest
    || use?.sessionId !== signal.sessionId
    || use.sessionDigest !== signal.sessionDigest
    || !signal.evidenceIds.includes(use.acceptanceEvidenceId)
  ) throw new Error('research summary Outcome source binding is unavailable')

  const inspection = await ctx.sessionPersistence.inspect(SessionId(signal.sessionId))
  const lifecycle = learningSessionLifecycleFingerprint({
    sessionId: String(inspection.meta.id),
    createdAt: inspection.meta.createdAt,
    ...(inspection.meta.cwd === undefined ? {} : { cwd: inspection.meta.cwd }),
  })
  if (String(inspection.meta.id) !== signal.sessionId
    || inspection.meta.parentSession !== undefined
    || inspection.meta.origin === 'subagent'
    || binding.sessionLifecycleFingerprint !== lifecycle) {
    throw new Error('research summary Outcome source Session identity is unavailable')
  }
  const events = frozenEvents(inspection.events, signal.sessionDigest)
  const evidence = ctx.tianwenEvidence.project({ id: inspection.meta.id, events } as never)
  if (sha256(evidence.map(item => item.evidenceId)) !== sha256(signal.evidenceIds)) {
    throw new Error('research summary Outcome evidence snapshot changed')
  }
  const accepted = evidence.filter(item =>
    item.evidenceId === use.acceptanceEvidenceId
    && item.action.toolName === RESEARCH_SUMMARY_TOOL_NAME
    && item.outcome.status === 'complete'
    && item.outcome.isError === false
    && item.outcome.errorCode === undefined)
  if (accepted.length !== 1 || accepted[0]!.source.resultSeq === undefined) {
    throw new Error('research summary Outcome accepted evidence is unavailable or ambiguous')
  }
  const packet = researchSummaryPacketFromEvents(events as never, binding.acceptanceSubjectDigest)?.packet
  const call = events.find(event => event.seq === accepted[0]!.source.callSeq)
  const result = events.find(event => event.seq === accepted[0]!.source.resultSeq)
  const terminal = call?.type === 'tool/call'
    ? events.find(event => event.type === 'turn/end'
        && event.data.turn === call.data.turn && event.seq > (result?.seq ?? Number.MAX_SAFE_INTEGER))
    : undefined
  if (packet === undefined
    || call?.type !== 'tool/call'
    || result?.type !== 'tool/result'
    || call.data.name !== RESEARCH_SUMMARY_TOOL_NAME
    || call.data.turn !== 1
    || result.data.turn !== call.data.turn
    || result.seq >= (terminal?.seq ?? -1)
    || terminal?.type !== 'turn/end'
    || terminal.data.reason.kind !== 'completed') {
    throw new Error('research summary Outcome source turn or accepted evidence is invalid')
  }
  let submission: ResearchSummarySubmission
  try {
    submission = normalizeResearchSummarySubmission(packet, JSON.parse(call.data.arguments) as unknown)
  } catch {
    throw new Error('research summary Outcome accepted call is not a canonical submission')
  }
  if (sha256(submission) !== sha256(acceptedResultSubmission(packet, result))) {
    throw new Error('research summary Outcome accepted call and result disagree')
  }
  return Object.freeze({
    source: Object.freeze({
      source: 'outcome' as const,
      signalId: signal.signalId,
      runId: signal.runId,
      sessionId: signal.sessionId,
      outcomeIngestionId: signal.ingestionId,
      sessionLifecycleFingerprint: lifecycle,
      sessionDigest: signal.sessionDigest,
      evidenceSetDigest: sha256(signal.evidenceIds),
      acceptanceSubjectDigest: binding.acceptanceSubjectDigest,
      packetDigest: sha256(packet.source),
      semanticReviewDigest: sha256(outcome.input.semanticReview),
    }),
    packet,
    submission,
    targetTurn: call.data.turn,
    acceptanceEvidenceId: use.acceptanceEvidenceId,
  })
}
