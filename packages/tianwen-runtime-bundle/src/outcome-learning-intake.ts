import { SessionId, type Agent, type Context } from '@tianwen/dsh-compat'
import { type LearningAnalysisStatus, type OutcomeLearningAnalysisBinding, type TianwenRunId } from '@tianwen/evolution'
import { normalizeResearchSummarySubmission, RESEARCH_SUMMARY_SCOPE, RESEARCH_SUMMARY_TOOL_NAME } from '@tianwen/runtime'
import { researchSummaryPacketFromEvents } from './research-summary-admission.js'

/** Select evidence from already-finished ordinary tasks; this does not run a judge. */
export async function admitOutcomeLearningAnalysis(ctx: Context, parent: Agent, runId: TianwenRunId): Promise<LearningAnalysisStatus | undefined> {
  const evolution = ctx.tianwenEvolution
  const run = evolution.getRunBinding(runId)
  const outcome = evolution.getOutcomeIntake(runId)
  if (run?.sessionId !== String(parent.session.id) || parent.session.header.parentSession !== undefined
    || parent.session.header.origin === 'subagent' || run.scopeKey !== RESEARCH_SUMMARY_SCOPE
    || run.acceptanceContract.gapDisposition !== 'reusable'
    || !run.acceptanceContract.problemCategory.startsWith('research-summary-result.v1:')
    || outcome === undefined || outcome.input.verdict === 'inconclusive' || evolution.getRunSkillUse(runId) === undefined) return undefined

  const consent = evolution.getLearningAnalysisConsent()
  if (consent?.enabled !== true || consent.policyVersion !== 'tianwen-auto-analysis.v2') {
    // Reuse the existing one-time main-conversation disclosure, not per-Ticket approval.
    if (outcome.input.verdict === 'not-met') await ctx.tianwenLearningConsentAgent.observeFeedbackWithoutConsent(run.sessionId)
    return undefined
  }
  if (outcome.at < consent.recordedAt) return undefined
  const signals = evolution.listLearningSignals().filter(signal => 'runId' in signal)
  const ticket = evolution.listLearningTickets().find(ticket => ticket.status === 'open'
    && ticket.signalIds.length >= 2
    && ticket.signalIds.every(id => {
      const signal = signals.find(item => item.signalId === id)
      return signal !== undefined && evolution.getRunBinding(signal.runId)?.acceptanceContractDigest === run.acceptanceContractDigest
        && signal.scopeKey === run.scopeKey
    }))
  if (ticket === undefined || evolution.listLearningAnalyses().some(analysis => analysis.source === 'outcome' && analysis.ticketId === ticket.ticketId)) return undefined
  const eligible = signals.filter(signal => ticket.signalIds.includes(signal.signalId)
    && (evolution.getOutcomeIntake(signal.runId)?.at ?? '') >= consent.recordedAt)
  if (eligible.length < 2) return undefined
  const counter = evolution.listRunSkillManifests().find(manifest => {
    const binding = evolution.getRunBinding(manifest.runId)
    const result = evolution.getOutcomeIntake(manifest.runId)
    return (outcome.input.verdict !== 'met' || manifest.runId === runId)
      && binding?.scopeKey === run.scopeKey && binding.acceptanceContractDigest === run.acceptanceContractDigest
      && result?.input.verdict === 'met' && result.at >= consent.recordedAt
      && evolution.getRunSkillUse(manifest.runId) !== undefined
  })
  // Outcome-derived Skill attribution already needs a successful counterexample.
  // Wait for ordinary evidence; do not manufacture another evaluation to get it.
  if (counter === undefined) return undefined
  return evolution.requestOutcomeLearningAnalysis({ ticketId: ticket.ticketId, sessionId: run.sessionId,
    parentSessionId: run.sessionId, consentRevision: consent.revision, counterevidenceRunIds: [counter.runId] })
}

/** Native references omit tool results. Supply only the frozen bounded task data. */
export async function outcomeAnalysisMaterial(ctx: Context, status: OutcomeLearningAnalysisBinding): Promise<string> {
  const signals = ctx.tianwenEvolution.listLearningSignals().filter(signal => 'runId' in signal)
    .filter(signal => status.signalIds.includes(signal.signalId))
  const runIds = [...signals.map(signal => signal.runId), ...status.counterevidenceRunIds]
  if (runIds.length !== status.signalIds.length + status.counterevidenceRunIds.length || runIds.length > 3) throw new Error('outcome analysis batch is unavailable')
  const material = []
  for (const runId of runIds) {
    const binding = ctx.tianwenEvolution.getRunBinding(runId)
    const outcome = ctx.tianwenEvolution.getOutcomeIntake(runId)
    if (binding === undefined || binding.schemaVersion === 'tianwen.run-binding.v1'
      || binding.acceptanceSubjectDigest === undefined || outcome === undefined) throw new Error('outcome analysis source is unavailable')
    const source = await ctx.sessionPersistence.inspect(SessionId(binding.sessionId))
    if (String(source.meta.id) !== binding.sessionId || source.meta.parentSession !== undefined || source.meta.origin === 'subagent') throw new Error('outcome source is not the bound main Session')
    // A Run covers the initial task, not later follow-ups in its main Session.
    const boundary = source.events.findIndex(event => event.type === 'turn/end' && event.data.turn === 1)
    if (boundary < 0) throw new Error('outcome source task is not complete')
    const events = source.events.slice(0, boundary + 1)
    const packet = researchSummaryPacketFromEvents(events, binding.acceptanceSubjectDigest)?.packet
    const evidence = ctx.tianwenEvidence.project({ id: source.meta.id, events })
      .filter(item => item.action.toolName === RESEARCH_SUMMARY_TOOL_NAME && outcome.input.evidenceIds.includes(item.evidenceId))
    const call = events.find(event => event.seq === evidence[0]?.source.callSeq)
    if (packet === undefined || evidence.length !== 1 || call?.type !== 'tool/call') throw new Error('outcome source no longer matches frozen evidence')
    const submission = normalizeResearchSummarySubmission(packet, JSON.parse(call.data.arguments) as unknown)
    material.push({ runId, evidenceId: evidence[0]!.evidenceId, verdict: outcome.input.verdict, packet: packet.source, submission })
  }
  return JSON.stringify(material)
}
