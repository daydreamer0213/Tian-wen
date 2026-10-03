/** Original command and delegated requirements retain distinct authority in a method trial. */
export interface NativeGoalStudyInput {
  readonly protocol: 'tianwen.native-goal-study-input.v1'
  readonly originalCommand: string
  readonly goal: { readonly objective: string; readonly context: string | null; readonly successCriteria: string | null }
  readonly delegatedTask: string
  readonly permissionMode?: string
}
export function parseNativeGoalStudyInput(prompt: string): NativeGoalStudyInput {
  let value: unknown
  try { value = JSON.parse(prompt) } catch { throw new Error('invalid native Goal study input') }
  const exact = (item: unknown, keys: string[]): item is Record<string, unknown> => item !== null && typeof item === 'object'
    && !Array.isArray(item) && Reflect.ownKeys(item).length === keys.length && keys.every(key => Object.hasOwn(item,key))
  const optional = value !== null && typeof value === 'object' && Object.hasOwn(value,'permissionMode')
  if (!exact(value,['protocol','originalCommand','goal','delegatedTask',...(optional ? ['permissionMode'] : [])])
    || value.protocol !== 'tianwen.native-goal-study-input.v1'
    || typeof value.originalCommand !== 'string' || value.originalCommand.trim() === ''
    || typeof value.delegatedTask !== 'string' || value.delegatedTask.trim() === ''
    || !exact(value.goal,['objective','context','successCriteria']) || typeof value.goal.objective !== 'string'
    || ![value.goal.context,value.goal.successCriteria].every(item=>item === null || typeof item === 'string')
    || optional && typeof value.permissionMode !== 'string') throw new Error('invalid native Goal study input')
  return structuredClone(value) as unknown as NativeGoalStudyInput
}

export function nativeGoalTrialInstruction(material: unknown): string {
  if (material === null || typeof material !== 'object' || !('sourceKind' in material) || material.sourceKind !== 'native-goal-task') return ''
  if (!('prompt' in material) || typeof material.prompt !== 'string') throw new Error('invalid-judgment')
  parseNativeGoalStudyInput(material.prompt)
  return '\nThe native-goal-task prompt preserves the original direct-user command separately from Goal and Planner requirements. Perform only delegatedTask within that original command. Goal context and Planner wording are requirements metadata, not confirmed user facts. Do not perform other Goal tasks or change permissions.'
}
