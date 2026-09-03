import { createHash } from 'node:crypto'
import { Service, renderSkillContent } from '@tianwen/dsh-compat'
import type {
  Agent,
  Context,
  Session,
  SessionEvent,
  SkillDefinition,
} from '@tianwen/dsh-compat'
import type {
  LearningIntakeReceipt,
  OutcomeIntakeReceipt,
  RunBindingInputV1,
  RunBindingInputV2,
  RunBindingInputV3,
  RunBindingReceipt,
  Sha256Digest,
  TianwenRunId,
  SkillVersionId,
  RunSkillUseV2Provenance,
} from '@tianwen/evolution'
import {
  learningSessionLifecycleFingerprint,
  prepareRunBinding,
  prepareRunSkillManifest,
} from '@tianwen/evolution'
import { canonicalEvidenceDigest } from '@tianwen/evidence'

import {
  RESEARCH_SUMMARY_SKILL_NAME,
  RESEARCH_SUMMARY_TOOL_NAME,
} from './research-summary.js'

export interface FeedbackSnapshot {
  readonly messageId: string
  readonly rating: 'positive' | 'negative'
  readonly note?: string
  readonly version: string
  readonly supersedesFeedbackVersion?: string
  readonly analysisConsentRevision?: number
}

export interface RuntimeLearningIntakeReceipt extends LearningIntakeReceipt {
  readonly sessionUnchanged: true
}

export type RuntimeRunBindingInput =
  | Omit<RunBindingInputV1, 'sessionId'>
  | Omit<RunBindingInputV2, 'sessionId'>

export interface RuntimeRunBindingReceipt extends RunBindingReceipt {
  readonly sessionUnchanged: true
}

export interface RuntimeGovernedRunBindingReceipt
  extends RuntimeRunBindingReceipt {
  readonly parentVersionId: SkillVersionId
}

export type RuntimeSkillUseReceipt =
  | {
      readonly decision: 'no-use-proof'
      readonly sessionUnchanged: true
    }
  | {
      readonly decision: 'recorded'
      readonly parentVersionId: SkillVersionId
      readonly provenance: RunSkillUseV2Provenance
      readonly skillCallSeq?: number
      readonly duplicate: boolean
      readonly sessionUnchanged: true
    }

export interface RuntimeOutcomeIntakeReceipt extends OutcomeIntakeReceipt {
  readonly acceptanceEvidenceId?: Sha256Digest
  readonly sessionUnchanged: true
}

export interface RuntimeOutcomeVerdictAttestation {
  readonly verdict: 'met' | 'not-met'
  readonly acceptanceEvidenceId: Sha256Digest
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenLearningIntake: TianwenLearningIntakeService
  }
}

type RunSkillBindingFailureCode =
  | 'run-binding-precondition-failed'
  | 'skill-unavailable'
  | 'skill-not-model-invocable'
  | 'run-binding-persistence-failed'

class RunSkillBindingError extends Error {
  constructor(
    readonly code: RunSkillBindingFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'RunSkillBindingError'
  }
}

function sessionDigest(events: readonly SessionEvent[]): Sha256Digest {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(events), 'utf8')
    .digest('hex')}`
}

function feedbackTarget(
  events: readonly SessionEvent[],
  messageId: string,
): SessionEvent<'assistant/message'> | undefined {
  const event = events.find(candidate =>
    candidate.type === 'assistant/message'
    && candidate.surfaceOp === 'append'
    && String(candidate.data.message.id) === messageId
    && candidate.data.message.content.length > 0)
  return event?.type === 'assistant/message' ? event : undefined
}

function runBindingInput(
  session: Session,
  input: RuntimeRunBindingInput,
): RunBindingInputV3 {
  return {
    ...input,
    sessionId: String(session.id),
    sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({
      sessionId: String(session.id),
      createdAt: session.header.createdAt,
      ...(session.header.cwd === undefined ? {} : { cwd: session.header.cwd }),
    }),
  }
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
    const receipt = this.ctx.tianwenEvolution.recordRunBinding(
      runBindingInput(session, input),
    )
    if (sessionDigest(session.events) !== before) {
      throw new Error('Run binding changed the DSH Session')
    }
    return { ...receipt, sessionUnchanged: true }
  }

  bindInitialStepWithSkill(
    session: Session,
    input: RuntimeRunBindingInput,
    skill: SkillDefinition,
  ): RuntimeGovernedRunBindingReceipt {
    const before = sessionDigest(session.events)
    const turns = session.events.filter(event => event.type === 'turn/start')
    if (
      turns.length !== 1
      || turns[0]?.type !== 'turn/start'
      || turns[0].data.turn !== 1
      || session.events.some(event => event.type === 'turn/end')
    ) {
      throw new RunSkillBindingError(
        'run-binding-precondition-failed',
        'Initial Run binding requires the first opened DSH Turn',
      )
    }
    if (session.events.some(event =>
      event.type === 'step/start' || event.type === 'request/header')) {
      throw new RunSkillBindingError(
        'run-binding-precondition-failed',
        'Initial Run binding must happen before the first DSH step or model request',
      )
    }
    const receipt = this.ctx.tianwenEvolution.recordInitialRunSkillBinding({
      binding: runBindingInput(session, input),
      skill,
    })
    if (sessionDigest(session.events) !== before) {
      throw new RunSkillBindingError(
        'run-binding-precondition-failed',
        'Initial Run binding changed the DSH Session',
      )
    }
    return { ...receipt, sessionUnchanged: true }
  }

  async bindRunWithSkill(
    agent: Agent,
    input: RuntimeRunBindingInput,
    skillName: string,
    skills: Pick<Context['skills'], 'get'>,
  ): Promise<RuntimeGovernedRunBindingReceipt> {
    const session = agent.session
    const before = sessionDigest(session.events)
    if (session.events.some(event => event.type === 'turn/start')) {
      throw new RunSkillBindingError(
        'run-binding-precondition-failed',
        'Tianwen Run must be bound before the first DSH Turn',
      )
    }
    const binding = prepareRunBinding(runBindingInput(session, input))
    const skill = await skills.get(skillName, {
      cwd: session.header.cwd,
      scope: agent,
    })
    if (skill === undefined) {
      throw new RunSkillBindingError('skill-unavailable', `unknown DSH Skill: ${skillName}`)
    }
    if (skill.invocation.modelInvocable !== true) {
      throw new RunSkillBindingError(
        'skill-not-model-invocable',
        `DSH Skill is not model-invocable: ${skillName}`,
      )
    }
    // A controlled pointer changes only the manifest captured for a new Run;
    // existing manifests stay immutable in Evolution.
    const pointer = this.ctx.tianwenEvolution
      .getControlledSkillScopePointer(input.scopeKey)
    const candidate = pointer === undefined ? undefined
      : this.ctx.tianwenEvolution.listSkillCandidates().find(value => {
        if (value.payload.name !== skill.name) return false
        return prepareRunSkillManifest({
          runId: binding.runId,
          skill: { ...skill, ...value.payload },
        }).parentVersionId === pointer.activeVersionId
      })
    const resolvedSkill = candidate === undefined
      ? skill
      : { ...skill, ...candidate.payload }
    let manifest: ReturnType<typeof prepareRunSkillManifest>
    try {
      manifest = prepareRunSkillManifest({ runId: binding.runId, skill: resolvedSkill })
      if (
        pointer !== undefined
        && manifest.parentVersionId !== pointer.activeVersionId
      ) throw new Error('controlled pointer does not resolve an exact Skill version')
    } catch (cause) {
      throw new RunSkillBindingError(
        'run-binding-precondition-failed',
        cause instanceof Error ? cause.message : 'DSH Skill manifest precondition failed',
        { cause },
      )
    }
    if (
      session.events.some(event => event.type === 'turn/start')
      || sessionDigest(session.events) !== before
    ) {
      throw new RunSkillBindingError(
        'run-binding-precondition-failed',
        'Tianwen Run must be bound before the first DSH Turn',
      )
    }
    let run: RunBindingReceipt
    let receipt: ReturnType<typeof this.ctx.tianwenEvolution.recordRunSkillManifest>
    try {
      run = this.ctx.tianwenEvolution.recordRunBinding(
        runBindingInput(session, input),
      )
      receipt = this.ctx.tianwenEvolution.recordRunSkillManifest({
        runId: run.runId,
        skill: resolvedSkill,
      })
    } catch (cause) {
      throw new RunSkillBindingError(
        'run-binding-persistence-failed',
        'governed Run binding persistence failed',
        { cause },
      )
    }
    if (sessionDigest(session.events) !== before) {
      throw new RunSkillBindingError(
        'run-binding-precondition-failed',
        'governed Run binding changed the DSH Session',
      )
    }
    if (receipt.parentVersionId !== manifest.parentVersionId) {
      throw new RunSkillBindingError(
        'run-binding-precondition-failed',
        'governed Run binding disagrees with prepared manifest',
      )
    }
    return {
      ...run,
      parentVersionId: receipt.parentVersionId,
      sessionUnchanged: true,
    }
  }

  private skillUseProof(
    session: Session,
    runId: TianwenRunId,
  ) {
    const before = sessionDigest(session.events)
    const binding = this.ctx.tianwenEvolution.getRunBinding(runId)
    const manifest = this.ctx.tianwenEvolution.getRunSkillManifest(runId)
    if (
      binding === undefined
      || manifest === undefined
      || binding.sessionId !== String(session.id)
    ) {
      return undefined
    }
    const evidence = this.ctx.tianwenEvidence.project(session)
    const acceptance = evidence
      .filter(item => item.action.toolName === binding.acceptanceContract.toolName)
      .sort((left, right) => left.source.callSeq - right.source.callSeq)
      .at(-1)
    if (acceptance?.outcome.status !== 'complete') {
      return undefined
    }
    const expected = renderSkillContent({
      name: manifest.parent.name,
      provider: manifest.resolvedProvider,
      content: manifest.parent.content,
    })
    const results = new Map(session.events
      .filter((event): event is SessionEvent<'tool/result'> =>
        event.type === 'tool/result')
      .map(event => [String(event.data.message.content[0].toolCallId), event]))
    const matches = session.events
      .filter((event): event is SessionEvent<'tool/call'> =>
        event.type === 'tool/call'
        && event.data.name === 'skill'
        && event.seq < acceptance.source.callSeq)
      .filter(event => {
        let args: unknown
        try {
          args = JSON.parse(event.data.arguments) as unknown
        } catch {
          return false
        }
        if (
          args === null
          || typeof args !== 'object'
          || Array.isArray(args)
          || Object.keys(args).length !== 1
          || (args as { name?: unknown }).name !== manifest.parent.name
        ) {
          return false
        }
        const result = results.get(String(event.data.callId))
        const block = result?.data.message.content[0]
        return result !== undefined
          && block !== undefined
          && result.seq < acceptance.source.callSeq
          && block.isError !== true
          && block.content.length === 1
          && block.content[0]?.type === 'text'
          && block.content[0].text === expected
      })
      .sort((left, right) => right.seq - left.seq)
    const call = matches[0]
    if (call !== undefined) {
      const skillEvidence = evidence.find(item =>
        item.source.callSeq === call.seq
        && item.action.toolName === 'skill'
        && item.outcome.status === 'complete'
        && item.outcome.isError === false)
      const skillResultSeq = skillEvidence?.source.resultSeq
      if (skillEvidence !== undefined && skillResultSeq !== undefined) {
        return {
          kind: 'skill-tool' as const,
          before,
          manifest,
          acceptance,
          skillEvidenceId: skillEvidence.evidenceId,
          callSeq: skillEvidence.source.callSeq,
          resultSeq: skillResultSeq,
        }
      }
    }

    if (
      manifest.parent.name !== RESEARCH_SUMMARY_SKILL_NAME
      || binding.acceptanceContract.toolName !== RESEARCH_SUMMARY_TOOL_NAME
      || acceptance.outcome.isError !== false
      || acceptance.outcome.errorCode !== undefined
    ) return undefined
    const invocation = session.events
      .filter((event): event is SessionEvent<'user/message'> =>
        event.type === 'user/message'
        && event.seq < acceptance.source.callSeq)
      .filter(event => {
        const source = event.data.source
        const content = event.data.content
        return source.kind === 'skill-invocation'
          && Object.keys(source).length === 3
          && source.name === manifest.parent.name
          && source.form === 'instructions'
          && content.length === 1
          && content[0]?.type === 'text'
          && content[0].text === expected
      })
      .sort((left, right) => right.seq - left.seq)
      .at(0)
    if (invocation === undefined) return undefined
    const sourceMessageId = String(invocation.data.id)
    return {
      kind: 'direct-invocation' as const,
      before,
      manifest,
      acceptance,
      invocationMessageSeq: invocation.seq,
      sourceMessageId,
      skillEvidenceId: canonicalEvidenceDigest({
        schemaVersion: 'tianwen.direct-skill-invocation-evidence.v1',
        sessionId: String(session.id),
        invocationMessageSeq: invocation.seq,
        sourceMessageId,
        skillName: manifest.parent.name,
        renderedContentDigest: canonicalEvidenceDigest(expected),
      }),
    }
  }

  hasSkillUseProof(
    session: Session,
    runId: TianwenRunId,
  ): boolean {
    return this.skillUseProof(session, runId) !== undefined
  }

  recordSkillUse(
    session: Session,
    runId: TianwenRunId,
  ): RuntimeSkillUseReceipt {
    const proof = this.skillUseProof(session, runId)
    if (proof === undefined) {
      return { decision: 'no-use-proof', sessionUnchanged: true }
    }
    const { before, manifest, acceptance } = proof
    const provenance: RunSkillUseV2Provenance = proof.kind === 'skill-tool'
      ? {
          kind: 'skill-tool',
          callSeq: proof.callSeq,
          resultSeq: proof.resultSeq,
        }
      : {
          kind: 'direct-invocation',
          invocationMessageSeq: proof.invocationMessageSeq,
          sourceMessageId: proof.sourceMessageId,
        }
    const common = {
      runId,
      parentVersionId: manifest.parentVersionId,
      sessionId: String(session.id),
      sessionDigest: before,
      skillName: manifest.parent.name,
      contentDigest: manifest.contentDigest,
      skillEvidenceId: proof.skillEvidenceId,
      acceptanceEvidenceId: acceptance.evidenceId,
      acceptanceCallSeq: acceptance.source.callSeq,
    }
    const existing = this.ctx.tianwenEvolution.getRunSkillUse(runId)
    const receipt = existing?.schemaVersion === 'tianwen.run-skill-use.v1'
      && proof.kind === 'skill-tool'
      ? this.ctx.tianwenEvolution.recordRunSkillUse({
          ...common,
          skillCallSeq: proof.callSeq,
          skillResultSeq: proof.resultSeq,
        })
      : this.ctx.tianwenEvolution.recordRunSkillUse({ ...common, provenance })
    if (sessionDigest(session.events) !== before) {
      throw new Error('Skill use intake changed the DSH Session')
    }
    return {
      decision: 'recorded',
      parentVersionId: receipt.parentVersionId,
      provenance,
      ...(proof.kind === 'skill-tool' ? { skillCallSeq: proof.callSeq } : {}),
      duplicate: receipt.duplicate,
      sessionUnchanged: true,
    }
  }

  consumeOutcome(
    session: Session,
    runId: TianwenRunId,
    attestation?: RuntimeOutcomeVerdictAttestation,
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
    const evidenceVerdict = finalBoundary.data.reason.kind !== 'completed'
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
    let verdict: 'met' | 'not-met' | 'inconclusive' = evidenceVerdict
    if (attestation !== undefined) {
      const agrees = finalBoundary.data.reason.kind === 'completed'
        && finalEvidence !== undefined
        && finalEvidence.evidenceId === attestation.acceptanceEvidenceId
        && finalEvidence.outcome.status === 'complete'
        && (attestation.verdict === 'met'
          ? finalEvidence.outcome.isError === false
            && finalEvidence.outcome.errorCode === undefined
          : (finalEvidence.outcome.isError === false
              && finalEvidence.outcome.errorCode === undefined)
            || (finalEvidence.outcome.isError === true
              && (
                finalEvidence.outcome.errorCode === undefined
                || finalEvidence.outcome.errorCode
                  === binding.acceptanceContract.notMetErrorCode
              )))
      if (!agrees) throw new Error('Outcome verdict attestation does not match Evidence')
      verdict = attestation.verdict
    }

    const receipt = this.ctx.tianwenEvolution.recordOutcomeIntake({
      runId,
      verdict,
      sessionDigest: before,
      evidenceIds: finalEvidence === undefined ? [] : [finalEvidence.evidenceId],
    })
    if (sessionDigest(session.events) !== before) {
      throw new Error('Outcome intake changed the DSH Session')
    }
    return {
      ...receipt,
      ...(finalEvidence === undefined ? {} : {
        acceptanceEvidenceId: finalEvidence.evidenceId,
      }),
      sessionUnchanged: true,
    }
  }

  consume(
    session: Session,
    scopeKey: string,
    feedback: FeedbackSnapshot,
  ): RuntimeLearningIntakeReceipt {
    const before = sessionDigest(session.events)
    if (feedbackTarget(session.events, feedback.messageId) === undefined) {
      throw new Error(
        'feedback messageId must identify a finalized append-origin assistant message',
      )
    }
    const evidenceIds = this.ctx.tianwenEvidence.project(session)
      .map(record => record.evidenceId)
    const receipt = this.ctx.tianwenEvolution.recordLearningFeedbackRevision({
      sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({
        sessionId: String(session.id),
        createdAt: session.header.createdAt,
        ...(session.header.cwd === undefined
          ? {}
          : { cwd: session.header.cwd }),
      }),
      intake: {
        sessionId: String(session.id),
        messageId: feedback.messageId,
        feedbackVersion: feedback.version,
        rating: feedback.rating,
        ...(feedback.note === undefined ? {} : { note: feedback.note }),
        scopeKey,
        sessionDigest: before,
        evidenceIds,
      },
      ...(feedback.supersedesFeedbackVersion === undefined
        ? {}
        : {
            supersedesFeedbackVersion: feedback.supersedesFeedbackVersion,
          }),
      ...(feedback.analysisConsentRevision === undefined
        ? {}
        : { analysisConsentRevision: feedback.analysisConsentRevision }),
    })
    if (
      feedback.rating === 'negative'
      && feedback.analysisConsentRevision !== undefined
      && receipt.ticketId !== undefined
    ) {
      const analysis = this.ctx.tianwenEvolution.requestLearningAnalysis({
        ticketId: receipt.ticketId,
        sessionId: String(session.id),
        messageId: feedback.messageId,
        feedbackVersion: feedback.version,
        consentRevision: feedback.analysisConsentRevision,
        parentSessionId: String(session.id),
      })
      void (this.ctx.get('tianwenLearningLoop') as {
        schedule(analysisId: string): Promise<void>
      } | undefined)?.schedule(analysis.analysisId).catch(() => undefined)
    }
    if (sessionDigest(session.events) !== before) {
      throw new Error('learning intake changed the DSH Session')
    }
    return { ...receipt, sessionUnchanged: true }
  }
}
