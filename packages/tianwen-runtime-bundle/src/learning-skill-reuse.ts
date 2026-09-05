import type { SkillDefinition, SkillRegistry, SkillViewOptions } from '@deepseek-ai/dsh-skill'
import { parseLearningSkillAdmission, sha256, type LearningSkillAdmission } from '@tianwen/evolution'
import { RESEARCH_SUMMARY_SCOPE, RESEARCH_SUMMARY_TOOL_NAME } from '@tianwen/runtime'

export const LEARNING_SKILL_INSPECTION_TOOL = 'inspect_tianwen_skills' as const

/** Native registry reads only. Review records come from the host, never Skill metadata. */
export async function inspectLearningSkills(
  registry: Pick<SkillRegistry, 'snapshot' | 'get'>,
  admissions: readonly LearningSkillAdmission[],
  scopeKey: string,
  name?: string,
  options: SkillViewOptions = {},
) {
  const skills: {
    reference: LearningSkillAdmission
    description: string
    whenToUse?: string
    definition?: SkillDefinition
  }[] = []
  options.signal?.throwIfAborted()
  if (admissions.length === 0) return { complete: true, skills }
  const catalog = await registry.snapshot(options)
  options.signal?.throwIfAborted()
  if (!catalog.complete) return { complete: false, skills }
  for (const configured of admissions) {
    let reference: LearningSkillAdmission
    try { reference = parseLearningSkillAdmission(configured) } catch { continue }
    if (reference.scopeKey !== scopeKey || scopeKey !== RESEARCH_SUMMARY_SCOPE
      || reference.toolName !== RESEARCH_SUMMARY_TOOL_NAME
      || (name !== undefined && reference.name !== name)
      || admissions.filter(item => item.name === reference.name).length !== 1) continue
    const summary = catalog.skills.find(item => item.name === reference.name)
    if (summary?.provider !== reference.provider || !summary.invocation.modelInvocable) continue
    const loaded = await registry.get(reference.name, options)
    options.signal?.throwIfAborted()
    if (loaded === undefined || loaded.name !== reference.name
      || loaded.provider !== reference.provider || !loaded.invocation.modelInvocable
      || sha256(loaded) !== reference.digest
      || Buffer.byteLength(loaded.content, 'utf8') > 16_384) continue
    skills.push({ reference, description: loaded.description,
      ...(loaded.whenToUse === undefined ? {} : { whenToUse: loaded.whenToUse }),
      ...(name === undefined ? {} : { definition: structuredClone(loaded) }),
    })
  }
  return { complete: true, skills }
}

/** A digest claim alone is not an observation: require the native tool's result. */
export function hasLearningSkillObservation(events: readonly unknown[], reference: LearningSkillAdmission): boolean {
  const calls = new Set<string>()
  for (const value of events) {
    const event = value as { type?: string, data?: { name?: string, callId?: string, message?: { content?: unknown[] } } }
    if (event?.type === 'tool/call' && event.data?.name === LEARNING_SKILL_INSPECTION_TOOL
      && typeof event.data.callId === 'string') calls.add(event.data.callId)
    if (event?.type !== 'tool/result') continue
    for (const item of event.data?.message?.content ?? []) {
      const result = item as { type?: string, toolCallId?: string, isError?: boolean, content?: unknown[] }
      if (result.type !== 'tool-result' || !calls.has(String(result.toolCallId)) || result.isError) continue
      for (const block of result.content ?? []) {
        const text = block as { type?: string, text?: string }
        if (text.type !== 'text' || typeof text.text !== 'string') continue
        try {
          const observed = JSON.parse(text.text)
          if (observed.complete === true && Array.isArray(observed.skills)
            && observed.skills.some((skill: { reference?: unknown, definition?: unknown }) =>
              skill.reference !== undefined && sha256(skill.reference) === sha256(reference)
              && skill.definition !== undefined && sha256(skill.definition) === reference.digest)) return true
        } catch { /* Unrelated or malformed results are not source observations. */ }
      }
    }
  }
  return false
}
