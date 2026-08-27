import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'

interface CompositionProbeConfig {
  readonly receiptPath: string
  readonly stopPath: string
  readonly surface: 'headless' | 'web'
  readonly exitAfterReceipt: boolean
}

interface LoaderEntry {
  readonly options: { readonly name: string }
}

interface Loader {
  entries(): Iterable<LoaderEntry>
}

export const name = 'tianwen-composition-probe'
export const inject = [
  'loader',
  'tianwenEvidence',
  'tianwenEvolution',
  'tianwenLearningIntake',
  'tianwenSkillEvaluation',
] as const

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`tianwen-composition-probe: ${label} is required`)
  }
  return value
}

export function apply(ctx: Context, config: CompositionProbeConfig): () => void {
  const receiptPath = requireString(config?.receiptPath, 'receiptPath')
  const stopPath = requireString(config?.stopPath, 'stopPath')
  if (config.surface !== 'headless' && config.surface !== 'web') {
    throw new Error('tianwen-composition-probe: surface must be headless or web')
  }
  const loader = ctx.get('loader') as Loader | undefined
  const appExit = ctx.get('appExit') as ((code: number) => void) | undefined
  if (loader === undefined) {
    throw new Error('tianwen-composition-probe: loader is unavailable')
  }
  if (appExit === undefined) {
    throw new Error('tianwen-composition-probe: appExit is unavailable')
  }

  const runtimeEntries = [...loader.entries()].filter(
    entry => entry.options.name === '@tianwen/runtime-bundle/runtime',
  ).length
  const receipt = {
    schemaVersion: 'tianwen.portable-composition-probe.v1',
    surface: config.surface,
    runtimeEntries,
    services: {
      evidence: ctx.get('tianwenEvidence') !== undefined,
      evolution: ctx.get('tianwenEvolution') !== undefined,
      learningIntake: ctx.get('tianwenLearningIntake') !== undefined,
      skillEvaluation: ctx.get('tianwenSkillEvaluation') !== undefined,
    },
    dynamicCordisRunner: ctx.get('dynamicCordisRunner') !== undefined,
    baseUrl: String(ctx.baseUrl ?? ''),
  }
  mkdirSync(dirname(receiptPath), { recursive: true })
  const stagedReceipt = `${receiptPath}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(stagedReceipt, `${JSON.stringify(receipt)}\n`, 'utf8')
  renameSync(stagedReceipt, receiptPath)

  if (config.exitAfterReceipt) {
    const immediate = setImmediate(() => appExit(0))
    return () => clearImmediate(immediate)
  }
  const timer = setInterval(() => {
    if (!existsSync(stopPath)) return
    clearInterval(timer)
    appExit(0)
  }, 50)
  return () => clearInterval(timer)
}
