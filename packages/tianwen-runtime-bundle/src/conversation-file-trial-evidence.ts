import { isAbsolute, relative, resolve, sep } from 'node:path'
import { isAppendSurfaceEvent, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { ConversationFileMaterial, ConversationJudgmentProof, Sha256Digest } from '@tianwen/evolution'

export interface ConversationFileTrialExecutionEvidence {
  readonly schemaVersion: 'tianwen.file-trial-execution.v1'
  readonly executionProof: ConversationJudgmentProof
  readonly outputDigest: Sha256Digest
  readonly actions: readonly {
    readonly tool: string
    readonly path: string | null
    readonly callSeq: number
    readonly resultSeq: number
    readonly status: 'success' | 'error'
  }[]
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Record<string, unknown>, expected: readonly string[]) => Object.keys(value).sort().join(',') === [...expected].sort().join(',')
const digest = (value: unknown) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value)

export function parseConversationFileTrialExecutionEvidence(value: unknown): ConversationFileTrialExecutionEvidence {
  if (!record(value) || !keys(value, ['schemaVersion', 'executionProof', 'outputDigest', 'actions'])
    || value.schemaVersion !== 'tianwen.file-trial-execution.v1' || !digest(value.outputDigest)
    || !record(value.executionProof) || !keys(value.executionProof, ['sessionId', 'sessionDigest', 'requestDigest'])
    || typeof value.executionProof.sessionId !== 'string' || value.executionProof.sessionId.trim() === ''
    || value.executionProof.sessionId.length > 1536 || !digest(value.executionProof.sessionDigest) || !digest(value.executionProof.requestDigest)
    || !Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > 12) throw new Error('invalid trial execution evidence')
  let previous = 0
  const results = new Set<number>()
  for (const action of value.actions) {
    if (!record(action) || !keys(action, ['tool', 'path', 'callSeq', 'resultSeq', 'status'])
      || typeof action.tool !== 'string' || action.tool.trim() === '' || action.tool.length > 80
      || !Number.isSafeInteger(action.callSeq) || (action.callSeq as number) <= previous
      || !Number.isSafeInteger(action.resultSeq) || (action.resultSeq as number) <= (action.callSeq as number) || results.has(action.resultSeq as number)
      || action.status !== 'success' && action.status !== 'error'
      || action.path !== null && (typeof action.path !== 'string' || action.path.length === 0 || isAbsolute(action.path)
        || action.path.includes('\\') || action.path.includes('\0') || action.path !== action.path.normalize('NFC')
        || action.path.split('/').some(part => part === '' || part === '.' || part === '..'))
      || action.status === 'success' && (action.path === null || !['read', 'write', 'edit'].includes(action.tool))) throw new Error('invalid trial execution evidence')
    previous = action.callSeq as number; results.add(action.resultSeq as number)
  }
  return value as unknown as ConversationFileTrialExecutionEvidence
}

/** Call only after the trial's complete native proof, material and output were
 * verified. This projection neither reads files nor certifies their truth. */
export function projectConversationFileTrialExecution(events: readonly SessionEvent[], root: string, files: ConversationFileMaterial,
  executionProof: ConversationJudgmentProof, outputDigest: Sha256Digest): ConversationFileTrialExecutionEvidence {
  const calls = events.filter(event => event.type === 'tool/call')
  const end = events.findLast(event => event.type === 'turn/end')
  if (end === undefined || end.data.reason.kind !== 'completed' || new Set(calls.map(call => String(call.data.callId))).size !== calls.length) throw new Error('invalid trial execution evidence')
  const paths = new Map(files.entries.map(entry => [entry.path.toLowerCase(), entry.path]))
  const actions = calls.map(call => {
    const results = events.filter(event => event.type === 'tool/result'
      && String(event.data.message.source.callId) === String(call.data.callId))
    const result = results[0]
    if (results.length !== 1 || result?.type !== 'tool/result' || !isAppendSurfaceEvent(result) || result.seq <= call.seq || result.seq >= end.seq
      || result.data.turn !== call.data.turn || result.data.step !== call.data.step
      || result.sourceEventSeqs?.length !== 1 || result.sourceEventSeqs[0] !== call.seq) throw new Error('invalid trial execution evidence')
    const status = result.data.error === undefined && result.data.message.content[0].isError !== true ? 'success' as const : 'error' as const
    let path: string | null = null
    try {
      const args: unknown = JSON.parse(call.data.arguments)
      if (['read', 'write', 'edit'].includes(call.data.name) && record(args) && typeof args.file_path === 'string' && !args.file_path.includes('\0')) {
        const candidate = relative(root, resolve(root, args.file_path))
        if (candidate !== '' && candidate !== '..' && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate)) {
          path = paths.get(candidate.split(sep).join('/').toLowerCase()) ?? null
        }
      }
    } catch { /* Malformed or rejected paths remain unknown, never invented. */ }
    return { tool: call.data.name, path, callSeq: call.seq, resultSeq: result.seq, status }
  })
  return parseConversationFileTrialExecutionEvidence({ schemaVersion: 'tianwen.file-trial-execution.v1', executionProof: structuredClone(executionProof), outputDigest, actions })
}

export function conversationFileTrialExecutionTexts(value: ConversationFileTrialExecutionEvidence): string[] {
  return [
    ...value.actions.map(action => `Native trial ${action.tool}${action.path === null ? ' (no verified frozen file path)' : ` ${JSON.stringify(action.path)}`}: call seq ${action.callSeq}; ${action.status} result seq ${action.resultSeq}.`),
    'These are all native tool attempts in this trial, including rejected attempts. They establish recorded actions and results only, not generated content truth, tests passing, or effects outside this trial.',
  ]
}
