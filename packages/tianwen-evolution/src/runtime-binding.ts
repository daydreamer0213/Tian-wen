import { Service } from '@tianwen/dsh-compat'
import type {
  Agent,
  Context,
} from '@tianwen/dsh-compat'

import {
  EvolutionLedger,
} from './ledger.js'
import type {
  ArtifactId,
  TransitionAuthority,
} from './ledger.js'

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

export class TianwenEvolutionService extends Service {
  static inject = ['dynamicCordisRunner']

  readonly ledger: EvolutionLedger
  private readonly bindings = new Map<ArtifactId, BoundRuntime>()
  private isBlocked: boolean

  constructor(ctx: Context, config: TianwenEvolutionConfig) {
    super(ctx, 'tianwenEvolution')
    this.ledger = new EvolutionLedger(config.root, {
      ...(config.clock === undefined ? {} : { clock: config.clock }),
    })
    this.isBlocked = this.ledger.hasRecoveryFailure()
  }

  get blocked(): boolean {
    return this.isBlocked
  }

  promote(agent: Agent, artifactId: ArtifactId): Promise<RuntimeBinding> {
    return this.transition(agent, artifactId, 'promotion')
  }

  rollback(agent: Agent, artifactId: ArtifactId): Promise<RuntimeBinding> {
    return this.transition(agent, artifactId, 'rollback')
  }

  async rehydrateChampion(
    agent: Agent,
  ): Promise<RuntimeBinding | undefined> {
    this.requireReady()
    const champion = this.ledger.getChampion()
    if (champion === undefined) {
      return undefined
    }
    const existing = this.bindings.get(champion.artifactId)
    if (existing !== undefined && this.isActive(existing)) {
      return publicBinding(existing)
    }
    const source = this.ledger.readSource(champion.artifactId)
    let binding: BoundRuntime | undefined
    try {
      binding = this.define(agent, champion.artifactId, source)
      await this.run(agent, binding, 'run')
    } catch (error) {
      const message = errorMessage(error)
      this.ledger.recordActivationFailed({
        artifactId: champion.artifactId,
        phase: 'rehydrate',
        message,
        ...(binding === undefined ? {} : { binding }),
      })
      this.ledger.recordRecoveryFailed(
        champion.artifactId,
        champion.artifactId,
        message,
      )
      this.isBlocked = true
      throw new EvolutionRecoveryError(
        champion.artifactId,
        champion.artifactId,
        `failed to rehydrate Champion: ${message}`,
        { cause: error },
      )
    }
    this.bindings.set(champion.artifactId, binding)
    this.ledger.recordRuntimeBinding(
      binding.artifactId,
      binding.pluginId,
      binding.packageId,
    )
    return publicBinding(binding)
  }

  private async transition(
    agent: Agent,
    artifactId: ArtifactId,
    kind: 'promotion' | 'rollback',
  ): Promise<RuntimeBinding> {
    this.requireReady()
    const authority = this.ledger.prepareTransition(artifactId, kind)
    const previous = this.ledger.getChampion()
    if (
      previous !== undefined &&
      this.bindings.get(previous.artifactId) === undefined
    ) {
      await this.rehydrateChampion(agent)
    }
    const previousBinding = previous === undefined
      ? undefined
      : this.bindings.get(previous.artifactId)

    const source = this.ledger.readSource(artifactId)
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
    if (kind === 'promotion') {
      this.ledger.promote(artifactId)
    } else {
      this.ledger.rollback(artifactId)
    }
    this.bindings.set(artifactId, binding)
    this.ledger.recordRuntimeBinding(
      binding.artifactId,
      binding.pluginId,
      binding.packageId,
    )
    return publicBinding(binding)
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
    const activationMessage = errorMessage(activationError)
    this.ledger.recordActivationFailed({
      artifactId,
      phase: kind,
      message: activationMessage,
      authority,
      ...(attemptedBinding === undefined
        ? {}
        : { binding: attemptedBinding }),
    })
    if (previousBinding === undefined) {
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
      this.ledger.recordRuntimeBinding(
        previousBinding.artifactId,
        previousBinding.pluginId,
        previousBinding.packageId,
      )
    } catch (recoveryError) {
      const recoveryMessage = errorMessage(recoveryError)
      this.ledger.recordRecoveryFailed(
        artifactId,
        previousBinding.artifactId,
        recoveryMessage,
      )
      this.isBlocked = true
      throw new EvolutionRecoveryError(
        artifactId,
        previousBinding.artifactId,
        `candidate activation failed and Champion recovery failed: ${recoveryMessage}`,
        { cause: recoveryError },
      )
    }
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
    if (this.isBlocked) {
      throw new Error(
        'Tianwen evolution is blocked after Champion recovery failure',
      )
    }
  }
}
