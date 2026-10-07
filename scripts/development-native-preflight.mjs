import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { developmentRuntimeConfig } from '../packages/tianwen-runtime-bundle/dist/development-runtime-boundary.js'
import { EvolutionLedger } from '../packages/tianwen-evolution/dist/ledger.js'

/** Check the original DEV boundary and saved state without mounting Runtime.
 * A populated Runtime can resume research during loading, even when a provider
 * guard forbids every call. Use the original ledger's inspection mode instead.
 * Actual execution must still use the original applyDevelopment entry.
 */
export async function inspectDevelopmentNativePreflight(ctx, { developmentRoot, guidanceDecisionPolicy, callConfig }) {
  assert(ctx.get('tianwenEvolution') === undefined && ctx.get('tianwenConversationGuidanceLoop') === undefined,
    'Read-only preflight requires a Context without mounted Tianwen work')
  const config = { developmentRoot, ...(guidanceDecisionPolicy === undefined ? {} : { guidanceDecisionPolicy }) }
  const paths = developmentRuntimeConfig(ctx.baseUrl, config, ctx.get('sessionPersistence'))
  const ledgerPath = join(paths.evolutionRoot, 'ledger.jsonl'), before = readFileSync(ledgerPath)
  try {
    const evolution = new EvolutionLedger(paths.evolutionRoot, {}, 'inspection')
    const resolved = await ctx.llm.resolveCallConfig({ provider: callConfig.provider, model: callConfig.model })
    assert.deepEqual(resolved, callConfig, 'Original provider configuration changed before execution')
    return { tasks: evolution.listConversationTasks(), studies: evolution.listConversationGuidanceStudies(),
      attempts: evolution.listConversationCaseDesignAttempts(), consent: evolution.getLearningAnalysisConsent(),
      callConfig: resolved, runtimeMounted: false, originalDevelopmentBoundary: true, originalLedgerInspection: true }
  } finally {
    assert(readFileSync(ledgerPath).equals(before), 'Read-only preflight changed the original ledger')
  }
}
