import type { Context } from '@deepseek-ai/cordis'
import { sha256, type GuidanceProof, type GuidanceStudyOpened } from '@tianwen/evolution'
import { recoverConversationStructuredJudgment } from './conversation-judgment.js'

export interface RecoveredConversationCaseDesign {
  readonly proof: GuidanceProof
  readonly instruction: string
  readonly material: unknown
  readonly output: unknown
  readonly semanticIndependence: 'unestablished'
}

/** Recover generation provenance, not semantic independence. Historical studies without a proof remain explicit gaps. */
export async function recoverConversationCaseDesign(ctx: Context, opened: GuidanceStudyOpened): Promise<RecoveredConversationCaseDesign | undefined> {
  if (opened.caseDesignProof === undefined) return
  const output: Record<string, unknown> = {}
  for (const kind of ['adjacent', 'holdout'] as const) {
    const matches = opened.cases.filter(item => item.kind === kind)
    const item = matches[0]
    if (matches.length !== 1 || item === undefined || !('prompt' in item)) throw new Error('source-unavailable:case-design-output')
    output[kind] = { prompt: item.prompt, criteria: item.criteria,
      ...(item.files === undefined ? {} : { files: { entries: item.files.entries, outputPaths: item.files.outputPaths } }) }
  }
  const recovered = await recoverConversationStructuredJudgment(ctx, opened.caseDesignProof, output)
  const material = recovered.material
  if (material === null || typeof material !== 'object' || Array.isArray(material)) throw new Error('source-unavailable:case-design-material')
  const row = material as Record<string, unknown>
  if (Object.keys(row).length !== 3 || !['family', 'failureCategory', 'sources'].every(key => Object.hasOwn(row, key))
    || row.family !== opened.family || row.failureCategory !== opened.failureCategory
    || !Array.isArray(row.sources) || row.sources.length !== 2
    || recovered.modelConfigDigests.length === 0 || recovered.modelConfigDigests.some(digest => digest !== opened.modelConfigDigest)) {
    throw new Error('source-unavailable:case-design-material')
  }
  for (const [index, kind] of (['source1', 'source2'] as const).entries()) {
    const matches = opened.cases.filter(item => item.kind === kind)
    const item = matches[0]
    if (matches.length !== 1 || item === undefined || !('sourceTaskId' in item)
      || item.sourceTaskId !== opened.sourceTaskIds[index] || sha256(row.sources[index]) !== item.materialDigest) {
      throw new Error('source-unavailable:case-design-source')
    }
  }
  return { proof: opened.caseDesignProof, instruction: recovered.instruction, material, output, semanticIndependence: 'unestablished' }
}
