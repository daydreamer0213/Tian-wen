import { createHash } from 'node:crypto'
import { Service, renderSkillContent } from '@tianwen/dsh-compat'
import type {
  Agent,
  Context,
  Session,
  SessionEvent,
} from '@tianwen/dsh-compat'
import type {
  LearningIntakeReceipt,
  OutcomeIntakeReceipt,
  RunBindingInputV1,
  RunBindingInputV2,
  RunBindingReceipt,
  Sha256Digest,
  TianwenRunId,
  SkillVersionId,
} from '@tianwen/evolution'
import {
  prepareRunBinding,
  prepareRunSkillManifest,
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
      readonly skillCallSeq: number
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
    const binding = prepareRunBinding({
      ...input,
      sessionId: String(session.id),
    })
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
    let manifest: ReturnType<typeof prepareRunSkillManifest>
    try {
      manifest = prepareRunSkillManifest({ runId: binding.runId, skill })
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
      run = this.ctx.tianwenEvolution.recordRunBinding({
        ...input,
        sessionId: String(session.id),
      })
      receipt = this.ctx.tianwenEvolution.recordRunSkillManifest({
        runId: run.runId,
        skill,
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
    if (call === undefined) {
      return undefined
    }
    const skillEvidence = evidence.find(item =>
      item.source.callSeq === call.seq
      && item.action.toolName === 'skill'
      && item.outcome.status === 'complete'
      && item.outcome.isError === false)
    if (skillEvidence === undefined) {
      return undefined
    }
    const skillResultSeq = skillEvidence.source.resultSeq
    if (skillResultSeq === undefined) {
      return undefined
    }
    return { before, manifest, acceptance, skillEvidence, skillResultSeq }
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
    const { before, manifest, acceptance, skillEvidence, skillResultSeq } = proof
    const receipt = this.ctx.tianwenEvolution.recordRunSkillUse({
      runId,
      parentVersionId: manifest.parentVersionId,
      sessionId: String(session.id),
      sessionDigest: before,
      skillName: manifest.parent.name,
      contentDigest: manifest.contentDigest,
      skillEvidenceId: skillEvidence.evidenceId,
      acceptanceEvidenceId: acceptance.evidenceId,
      skillCallSeq: skillEvidence.source.callSeq,
      skillResultSeq,
      acceptanceCallSeq: acceptance.source.callSeq,
    })
    if (sessionDigest(session.events) !== before) {
      throw new Error('Skill use intake changed the DSH Session')
    }
    return {
      decision: 'recorded',
      parentVersionId: receipt.parentVersionId,
      skillCallSeq: skillEvidence.source.callSeq,
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
