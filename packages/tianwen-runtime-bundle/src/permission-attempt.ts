import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import {
  SANDBOX_UNAVAILABLE,
  sandboxDenialMarker,
} from '@deepseek-ai/dsh-sandbox'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  canonicalEvidenceDigest,
  type EvidenceRecord,
} from '@tianwen/evidence'

export interface PermissionSnapshot {
  readonly mode: SandboxMode
  readonly eventSeq: number | null
  readonly fingerprint: `sha256:${string}`
}

export type PermissionClassificationSnapshot = Omit<PermissionSnapshot, 'mode'> & {
  readonly mode?: SandboxMode
}

function explicitSandboxEventSeq(events: readonly SessionEvent[]): number | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as unknown as {
      readonly type?: unknown
      readonly seq?: unknown
      readonly data?: { readonly source?: unknown }
    } | undefined
    if (event?.type !== 'sandbox/mode' || typeof event.seq !== 'number') continue
    if (event.data?.source !== 'delegation') return event.seq
  }
  return null
}

export function permissionSnapshot(
  parentEvents: readonly SessionEvent[],
  effectiveMode: SandboxMode,
): PermissionSnapshot {
  const eventSeq = explicitSandboxEventSeq(parentEvents)
  return {
    mode: effectiveMode,
    eventSeq,
    fingerprint: canonicalEvidenceDigest({ eventSeq, mode: effectiveMode }),
  }
}

export function isPermissionLimited(
  result: SessionEvent<'tool/result'>,
  evidence: EvidenceRecord,
  snapshot: PermissionClassificationSnapshot,
): boolean {
  if (evidence.outcome.status !== 'complete') return false
  if (
    evidence.outcome.errorCode === SANDBOX_UNAVAILABLE
    || evidence.outcome.errorCode === 'FS_SANDBOX_DENIED'
  ) return true
  const mode = snapshot.mode
  if (mode === undefined) return false
  const block = result.data.message.content[0]
  if (evidence.outcome.isError !== true || block?.isError !== true) return false
  return block.content.some(item =>
    item.type === 'text'
    && item.text.split(/\r?\n/u).includes(sandboxDenialMarker(mode)))
}

export function permissionLimitedEvidence(
  events: readonly SessionEvent[],
  evidenceRecords: readonly EvidenceRecord[],
  snapshot: PermissionClassificationSnapshot,
): EvidenceRecord | undefined {
  const results = new Map(events
    .filter((event): event is SessionEvent<'tool/result'> => event.type === 'tool/result')
    .map(event => [event.seq, event]))
  return evidenceRecords.find(evidence => {
    const result = evidence.source.resultSeq === undefined
      ? undefined
      : results.get(evidence.source.resultSeq)
    return result !== undefined && isPermissionLimited(result, evidence, snapshot)
  })
}
