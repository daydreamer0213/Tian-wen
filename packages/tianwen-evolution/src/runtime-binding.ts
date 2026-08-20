import { Service } from '@tianwen/dsh-compat'
import type {
  Agent,
  Context,
} from '@tianwen/dsh-compat'

import {
  EvolutionLedger,
  LedgerCommitUnknownError,
} from './ledger.js'
import type {
  ApprovalRecord,
  ArtifactId,
  ArtifactVersion,
  ChampionPointer,
  EvaluationRecord,
  LedgerEvent,
  PublicLedgerEvent,
  TransitionAuthority,
} from './ledger.js'
import type {
  RunBindingInput,
  RunBindingReceipt,
  TianwenRunBinding,
  TianwenRunId,
} from './outcome-intake.js'
import type {
  LearningIntakeInput,
  LearningIntakeReceipt,
  LearningSignal,
  LearningTicket,
} from './learning-intake.js'

export interface RuntimeBinding {
  readonly artifactId: ArtifactId
  readonly pluginId: string
  readonly packageId: string
}

type DynamicPluginId =
  Parameters<Context['dynamicCordisRunner']['run']>[1]
type DynamicPackageId =
  Parameters<Context['dynamicCordisRunner']['run']>[2]

interface BoundRuntime {
  readonly artifactId: ArtifactId
  readonly pluginId: DynamicPluginId
  readonly packageId: DynamicPackageId
}

interface EvolutionState {
  readonly ledger: EvolutionLedger
  readonly bindings: Map<ArtifactId, BoundRuntime>
  blocked: boolean
  operations: Promise<void>
  pendingOperations: number
}

const STATES = new WeakMap<Context, EvolutionState>()

export interface TianwenEvolutionConfig {
  readonly root: string
  readonly clock?: () => string
}

export class EvolutionActivationError extends Error {
  constructor(
    readonly artifactId: ArtifactId,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'EvolutionActivationError'
  }
}

export class EvolutionRecoveryError extends Error {
  constructor(
    readonly artifactId: ArtifactId,
    readonly previousArtifactId: ArtifactId,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'EvolutionRecoveryError'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenEvolution: TianwenEvolutionService
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function publicBinding(binding: BoundRuntime): RuntimeBinding {
  return {
    artifactId: binding.artifactId,
    pluginId: binding.pluginId,
    packageId: binding.packageId,
  }
}

function isPublicLedgerEvent(
  event: LedgerEvent,
): event is PublicLedgerEvent {
  return event.type !== 'learning-intake-recorded'
    && event.type !== 'run-binding-recorded'
}

export class TianwenEvolutionService extends Service {
  static inject = ['dynamicCordisRunner']

  constructor(ctx: Context, config: TianwenEvolutionConfig) {
    super(ctx, 'tianwenEvolution')
    const ledger = new EvolutionLedger(config.root, {
      ...(config.clock === undefined ? {} : { clock: config.clock }),
    })
    STATES.set(ctx.root, {
      ledger,
      bindings: new Map(),
      blocked: ledger.hasRecoveryFailure(),
      operations: Promise.resolve(),
      pendingOperations: 0,
    })
  }

  get blocked(): boolean {
    return this.state().blocked
  }

  recordArtifact(
    source: string,
    parentArtifactId?: ArtifactId,
  ): ArtifactVersion {
    return this.formalWrite(() =>
      this.state().ledger.recordArtifact(source, parentArtifactId))
  }

  recordEvaluation(record: EvaluationRecord): void {
    this.formalWrite(() => this.state().ledger.recordEvaluation(record))
  }

  recordApproval(record: ApprovalRecord): void {
    this.formalWrite(() => this.state().ledger.recordApproval(record))
  }

  recordLearningIntake(input: LearningIntakeInput): LearningIntakeReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningIntake(input))
  }

  recordRunBinding(input: RunBindingInput): RunBindingReceipt {
    return this.formalWrite(() => this.state().ledger.recordRunBinding(input))
  }

  getRunBinding(runId: TianwenRunId): TianwenRunBinding | undefined {
    return this.state().ledger.getRunBinding(runId)
  }

  listLearningSignals(): readonly LearningSignal[] {
    return this.state().ledger.listLearningSignals()
  }

  listLearningTickets(): readonly LearningTicket[] {
    return this.state().ledger.listLearningTickets()
  }

  getChampion(): ChampionPointer | undefined {
    return this.state().ledger.getChampion()
  }

  listEvents(): readonly PublicLedgerEvent[] {
    return this.state().ledger.listEvents()
      .filter(isPublicLedgerEvent)
  }

  promote(agent: Agent, artifactId: ArtifactId): Promise<RuntimeBinding> {
    return this.serialize(() =>
      this.transition(agent, artifactId, 'promotion'))
  }

  rollback(agent: Agent, artifactId: ArtifactId): Promise<RuntimeBinding> {
    return this.serialize(() =>
      this.transition(agent, artifactId, 'rollback'))
  }

  rehydrateChampion(
    agent: Agent,
  ): Promise<RuntimeBinding | undefined> {
    return this.serialize(() => this.rehydrate(agent))
  }

  private async rehydrate(
    agent: Agent,
  ): Promise<RuntimeBinding | undefined> {
    this.requireReady()
    const champion = this.state().ledger.getChampion()
    if (champion === undefined) {
      return undefined
    }
    const existing = this.state().bindings.get(champion.artifactId)
    if (existing !== undefined && this.isActive(existing)) {
      return publicBinding(existing)
    }
    const state = this.state()
    state.blocked = true
    const source = this.state().ledger.readSource(champion.artifactId)
    let binding: BoundRuntime | undefined
    try {
      binding = this.define(agent, champion.artifactId, source)
      await this.run(agent, binding, 'run')
    } catch (error) {
      const message = errorMessage(error)
      let auditError: unknown
      try {
        state.ledger.recordActivationFailed({
          artifactId: champion.artifactId,
          phase: 'rehydrate',
          message,
          ...(binding === undefined ? {} : { binding }),
        })
        state.ledger.recordRecoveryFailed(
          champion.artifactId,
          champion.artifactId,
          message,
        )
      } catch (auditFailure) {
        auditError = auditFailure
      }
      throw new EvolutionRecoveryError(
        champion.artifactId,
        champion.artifactId,
        `failed to rehydrate Champion: ${message}${
          auditError === undefined
            ? ''
            : `; audit failed: ${errorMessage(auditError)}`
        }`,
        { cause: error },
      )
    }
    state.bindings.set(champion.artifactId, binding)
    try {
      state.ledger.recordRuntimeBinding(
        binding.artifactId,
        binding.pluginId,
        binding.packageId,
      )
    } catch (error) {
      throw new EvolutionRecoveryError(
        champion.artifactId,
        champion.artifactId,
        `Champion is active but runtime binding audit failed: ${
          errorMessage(error)
        }`,
        { cause: error },
      )
    }
    state.blocked = false
    return publicBinding(binding)
  }

  private async transition(
    agent: Agent,
    artifactId: ArtifactId,
    kind: 'promotion' | 'rollback',
  ): Promise<RuntimeBinding> {
    this.requireReady()
    const authority = this.state().ledger.prepareTransition(artifactId, kind)
    const previous = this.state().ledger.getChampion()
    if (
      previous !== undefined &&
      this.state().bindings.get(previous.artifactId) === undefined
    ) {
      await this.rehydrate(agent)
    }
    const previousBinding = previous === undefined
      ? undefined
      : this.state().bindings.get(previous.artifactId)

    const source = this.state().ledger.readSource(artifactId)
    let binding: BoundRuntime | undefined
    try {
      binding = this.define(
        agent,
        artifactId,
        source,
        previousBinding?.pluginId,
      )
      await this.run(
        agent,
        binding,
        previousBinding === undefined ? 'run' : 'update',
      )
    } catch (error) {
      await this.activationFailed(
        agent,
        artifactId,
        kind,
        authority,
        previousBinding,
        binding,
        error,
      )
    }

    if (binding === undefined) {
      throw new Error('unreachable: successful activation has no binding')
    }
    const state = this.state()
    const expectedRevision = (previous?.revision ?? 0) + 1
    try {
      if (kind === 'promotion') {
        state.ledger.promote(artifactId)
      } else {
        state.ledger.rollback(artifactId)
      }
    } catch (error) {
      if (error instanceof LedgerCommitUnknownError) {
        state.bindings.set(artifactId, binding)
        state.blocked = true
        throw new EvolutionRecoveryError(
          artifactId,
          previous?.artifactId ?? artifactId,
          'formal transition commit is unknown; fresh replay is required',
          { cause: error },
        )
      }
      const committed = state.ledger.getChampion()
      if (
        committed?.artifactId === artifactId &&
        committed.revision === expectedRevision
      ) {
        state.bindings.set(artifactId, binding)
        state.blocked = true
        throw new EvolutionRecoveryError(
          artifactId,
          previous?.artifactId ?? artifactId,
          `formal transition committed but derived Champion pointer failed: ${
            errorMessage(error)
          }`,
          { cause: error },
        )
      }
      if (previousBinding !== undefined) {
        await this.activationFailed(
          agent,
          artifactId,
          kind,
          authority,
          previousBinding,
          binding,
          error,
        )
      }
      await this.stopUncommittedFirstChampion(
        agent,
        binding,
        kind,
        authority,
        error,
      )
    }
    state.bindings.set(artifactId, binding)
    try {
      state.ledger.recordRuntimeBinding(
        binding.artifactId,
        binding.pluginId,
        binding.packageId,
      )
    } catch (error) {
      state.blocked = true
      throw new EvolutionRecoveryError(
        artifactId,
        previous?.artifactId ?? artifactId,
        `Champion is active but runtime binding audit failed: ${
          errorMessage(error)
        }`,
        { cause: error },
      )
    }
    return publicBinding(binding)
  }

  private async stopUncommittedFirstChampion(
    agent: Agent,
    binding: BoundRuntime,
    kind: 'promotion' | 'rollback',
    authority: TransitionAuthority,
    commitError: unknown,
  ): Promise<never> {
    const state = this.state()
    state.blocked = true
    let stopError: unknown
    try {
      const stopped = await this.ctx.dynamicCordisRunner.stop(
        agent,
        binding.pluginId,
      )
      if (!stopped.ok) {
        stopError = new Error(stopped.message)
      }
    } catch (error) {
      stopError = error
    }
    let auditError: unknown
    try {
      state.ledger.recordActivationFailed({
        artifactId: binding.artifactId,
        phase: kind,
        message: `formal transition commit failed: ${errorMessage(commitError)}`,
        authority,
        binding,
      })
    } catch (error) {
      auditError = error
    }
    if (stopError !== undefined || auditError !== undefined) {
      const failure = stopError ?? auditError
      throw new EvolutionRecoveryError(
        binding.artifactId,
        binding.artifactId,
        `uncommitted first Champion could not be safely stopped/audited: ${
          errorMessage(failure)
        }`,
        { cause: failure },
      )
    }
    state.blocked = false
    throw new EvolutionActivationError(
      binding.artifactId,
      `Dynamic activation was stopped because formal commit failed: ${
        errorMessage(commitError)
      }`,
      { cause: commitError },
    )
  }

  private define(
    agent: Agent,
    artifactId: ArtifactId,
    source: string,
    pluginId?: DynamicPluginId,
  ): BoundRuntime {
    const receipt = this.ctx.dynamicCordisRunner.define({
      sessionId: agent.id,
      plugin: pluginId === undefined
        ? { kind: 'new', idPrefix: 'tian' }
        : { kind: 'existing', pluginId },
      name: `artifact-${artifactId.slice('artifact:'.length, 20)}`,
      purpose: `Activate formal Tianwen ${artifactId}`,
      code: { host: source },
    })
    return {
      artifactId,
      pluginId: receipt.pluginId,
      packageId: receipt.packageId,
    }
  }

  private async run(
    agent: Agent,
    binding: BoundRuntime,
    mode: 'run' | 'update',
  ): Promise<void> {
    const result = await this.ctx.dynamicCordisRunner.run(
      agent,
      binding.pluginId,
      binding.packageId,
      mode,
    )
    if (!result.ok || result.status !== 'running') {
      throw new Error(
        result.ok
          ? `Dynamic activation did not complete: ${result.status}`
          : result.message,
      )
    }
    if (!this.isActive(binding)) {
      throw new Error('Dynamic runner did not retain the activated package')
    }
  }

  private async activationFailed(
    agent: Agent,
    artifactId: ArtifactId,
    kind: 'promotion' | 'rollback',
    authority: TransitionAuthority,
    previousBinding: BoundRuntime | undefined,
    attemptedBinding: BoundRuntime | undefined,
    activationError: unknown,
  ): Promise<never> {
    const state = this.state()
    state.blocked = true
    const activationMessage = errorMessage(activationError)
    let activationAuditError: unknown
    try {
      state.ledger.recordActivationFailed({
        artifactId,
        phase: kind,
        message: activationMessage,
        authority,
        ...(attemptedBinding === undefined
          ? {}
          : { binding: attemptedBinding }),
      })
    } catch (error) {
      activationAuditError = error
    }
    if (previousBinding === undefined) {
      if (activationAuditError !== undefined) {
        throw new EvolutionRecoveryError(
          artifactId,
          artifactId,
          `activation failed and its audit could not be persisted: ${
            errorMessage(activationAuditError)
          }`,
          { cause: activationAuditError },
        )
      }
      state.blocked = false
      throw new EvolutionActivationError(
        artifactId,
        `Dynamic activation failed: ${activationMessage}`,
        { cause: activationError },
      )
    }

    try {
      const row = this.ctx.dynamicCordisRunner.inventory()
        .find(item => item.pluginId === previousBinding.pluginId)
      const mode = row?.currentPackageId === previousBinding.packageId
        ? 'run'
        : 'update'
      await this.run(agent, previousBinding, mode)
    } catch (recoveryError) {
      const recoveryMessage = errorMessage(recoveryError)
      try {
        state.ledger.recordRecoveryFailed(
          artifactId,
          previousBinding.artifactId,
          recoveryMessage,
        )
      } catch {
        // The process-local blocked state is authoritative for this failed run.
      }
      throw new EvolutionRecoveryError(
        artifactId,
        previousBinding.artifactId,
        `candidate activation failed and Champion recovery failed: ${recoveryMessage}`,
        { cause: recoveryError },
      )
    }
    let recoveryAuditError: unknown
    try {
      state.ledger.recordRuntimeBinding(
        previousBinding.artifactId,
        previousBinding.pluginId,
        previousBinding.packageId,
      )
    } catch (error) {
      recoveryAuditError = error
    }
    const auditError = activationAuditError ?? recoveryAuditError
    if (auditError !== undefined) {
      throw new EvolutionRecoveryError(
        artifactId,
        previousBinding.artifactId,
        `previous Champion restored but recovery audit failed: ${
          errorMessage(auditError)
        }`,
        { cause: auditError },
      )
    }
    state.blocked = false
    throw new EvolutionActivationError(
      artifactId,
      `Dynamic activation failed; previous Champion restored: ${activationMessage}`,
      { cause: activationError },
    )
  }

  private isActive(binding: BoundRuntime): boolean {
    const row = this.ctx.dynamicCordisRunner.inventory()
      .find(item => item.pluginId === binding.pluginId)
    return (
      row?.currentPackageId === binding.packageId &&
      row?.activeRun?.packageId === binding.packageId
    )
  }

  private requireReady(): void {
    if (this.state().blocked) {
      throw new Error(
        'Tianwen evolution is blocked after Champion recovery failure',
      )
    }
  }

  private requireNoTransition(): void {
    if (this.state().pendingOperations > 0) {
      throw new Error(
        'formal records cannot change during a Champion transition',
      )
    }
  }

  private formalWrite<T>(operation: () => T): T {
    this.requireReady()
    this.requireNoTransition()
    try {
      return operation()
    } catch (error) {
      if (error instanceof LedgerCommitUnknownError) {
        this.state().blocked = true
      }
      throw error
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.state()
    state.pendingOperations += 1
    const result = state.operations.then(operation)
    state.operations = result.then(
      () => {
        state.pendingOperations -= 1
      },
      () => {
        state.pendingOperations -= 1
      },
    )
    return result
  }

  private state(): EvolutionState {
    const state = STATES.get(this.ctx.root)
    if (state === undefined) {
      throw new Error('Tianwen evolution state is unavailable')
    }
    return state
  }
}
