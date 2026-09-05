import { Service } from '@tianwen/dsh-compat'
import type { Context, Session } from '@tianwen/dsh-compat'

import { canonicalEvidenceDigest, projectEvidence } from './projector.js'
import type { EvidenceRecord } from './projector.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenEvidence: TianwenEvidenceService
  }
}

export { canonicalEvidenceDigest, projectEvidence }
export type { EvidenceRecord }

export class TianwenEvidenceService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tianwenEvidence')
  }

  project(session: Pick<Session, 'id' | 'events'>): readonly EvidenceRecord[] {
    return projectEvidence(session.id, session.events)
  }
}
