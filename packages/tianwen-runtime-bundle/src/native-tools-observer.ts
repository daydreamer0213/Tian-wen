import { createHash } from 'node:crypto'
import type { Fiber, Plugin } from '@deepseek-ai/cordis'
import { scopeOf, type ScopeKey } from '@deepseek-ai/dsh-scope'
import { ToolRuntime, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import * as fsSearch from '@deepseek-ai/dsh-tool-fs-search'
import * as skill from '@deepseek-ai/dsh-tool-skill'
import * as pwsh from '@deepseek-ai/dsh-tool-pwsh'

export interface NativeToolRegistrationProducer {
  readonly package: '@deepseek-ai/dsh-tool-fs-search' | '@deepseek-ai/dsh-tool-skill' | '@deepseek-ai/dsh-tool-pwsh'
  readonly version: '0.1.1-rc.2'
  readonly adapter: 'tianwen.file-ancillary.v1'
}

interface DefinitionReferences {
  readonly execute: ToolDefinition['execute']
  readonly finalizeContent: ToolDefinition['finalizeContent']
  readonly isConcurrencySafe: ToolDefinition['isConcurrencySafe']
  readonly presentCall: ToolDefinition['presentCall']
  readonly presentResult: ToolDefinition['presentResult']
  readonly render: ToolDefinition['output']['render']
  readonly presentationMeta: ToolDefinition['output']['presentationMeta']
}

interface NativeRegistrationRecord {
  readonly definition: ToolDefinition
  readonly originFiber: Fiber
  readonly originScope: ScopeKey | undefined
  readonly callback: Function
  readonly module: Plugin
  readonly producer: NativeToolRegistrationProducer
  readonly schemaDigest: string
  readonly references: DefinitionReferences
}

const nativeModules: readonly {
  readonly module: Plugin
  readonly producer: NativeToolRegistrationProducer
}[] = [
  {
    module: fsSearch,
    producer: {
      package: '@deepseek-ai/dsh-tool-fs-search',
      version: '0.1.1-rc.2',
      adapter: 'tianwen.file-ancillary.v1',
    },
  },
  {
    module: skill,
    producer: {
      package: '@deepseek-ai/dsh-tool-skill',
      version: '0.1.1-rc.2',
      adapter: 'tianwen.file-ancillary.v1',
    },
  },
  {
    module: pwsh,
    producer: {
      package: '@deepseek-ai/dsh-tool-pwsh',
      version: '0.1.1-rc.2',
      adapter: 'tianwen.file-ancillary.v1',
    },
  },
]

function schemaDigest(definition: ToolDefinition): string {
  const encoded = JSON.stringify({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    output: definition.output.schema,
    timeoutMs: definition.timeoutMs ?? null,
  })
  return createHash('sha256').update(encoded).digest('hex')
}

function references(definition: ToolDefinition): DefinitionReferences {
  return {
    execute: definition.execute,
    finalizeContent: definition.finalizeContent,
    isConcurrencySafe: definition.isConcurrencySafe,
    presentCall: definition.presentCall,
    presentResult: definition.presentResult,
    render: definition.output.render,
    presentationMeta: definition.output.presentationMeta,
  }
}

function sameReferences(
  definition: ToolDefinition,
  expected: DefinitionReferences,
): boolean {
  const actual = references(definition)
  return (Object.keys(actual) as (keyof DefinitionReferences)[])
    .every(key => actual[key] === expected[key])
}

/**
 * The installed ToolRuntime with read-only provenance observation added at its
 * existing public registration seam. Native plugins still own the definitions,
 * scopes, effects and exact registration disposers.
 */
export class NativeObservedToolRuntime extends ToolRuntime {
  private readonly seenDefinitions = new WeakSet<ToolDefinition>()
  private readonly ambiguousDefinitions = new WeakSet<ToolDefinition>()
  private readonly nativeRegistrations = new WeakMap<ToolDefinition, NativeRegistrationRecord>()

  override register(definition: ToolDefinition): () => void {
    const caller = this.ctx
    const originFiber = caller.fiber
    const disposer = super.register(definition)

    try {
      if (this.seenDefinitions.has(definition)) {
        this.ambiguousDefinitions.add(definition)
        this.nativeRegistrations.delete(definition)
        return disposer
      }
      this.seenDefinitions.add(definition)

      const callback = originFiber.runtime?.callback
      if (callback === undefined) return disposer
      const matched = nativeModules.filter(candidate =>
        caller.registry.resolve(candidate.module) === callback)
      if (matched.length !== 1) return disposer

      const candidate = matched[0]!
      this.nativeRegistrations.set(definition, {
        definition,
        originFiber,
        originScope: scopeOf(caller),
        callback,
        module: candidate.module,
        producer: candidate.producer,
        schemaDigest: schemaDigest(definition),
        references: references(definition),
      })
    } catch {
      this.nativeRegistrations.delete(definition)
    }

    return disposer
  }

  nativeRegistration(
    definition: ToolDefinition,
  ): NativeToolRegistrationProducer | undefined {
    try {
      if (this.ambiguousDefinitions.has(definition)) return undefined
      const record = this.nativeRegistrations.get(definition)
      if (record === undefined || record.definition !== definition) return undefined
      if (record.originFiber.uid === null
        || record.originFiber.runtime?.callback !== record.callback
        || this.ctx.registry.resolve(record.module) !== record.callback
        || this.get(definition.name, record.originScope) !== definition
        || schemaDigest(definition) !== record.schemaDigest
        || !sameReferences(definition, record.references)) return undefined
      return { ...record.producer }
    } catch {
      return undefined
    }
  }
}

// Cordis uses the plugin callback's public name for diagnostics. Keep the
// installed provider's name while exporting the derived class under a new API.
Object.defineProperty(NativeObservedToolRuntime, 'name', {
  value: ToolRuntime.name,
})

export default NativeObservedToolRuntime
