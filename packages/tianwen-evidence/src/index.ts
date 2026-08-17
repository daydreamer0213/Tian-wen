import { Service } from '@tianwen/dsh-compat'
import type { Context, Session } from '@tianwen/dsh-compat'

import { projectEvidence } from './projector.js'
import type { EvidenceRecord } from './projector.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenEvidence: TianwenEvidenceService
  }
}

export { projectEvidence }
export type { EvidenceRecord }

export class TianwenEvidenceService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tianwenEvidence')
  }

  project(session: Session): readonly EvidenceRecord[] {
    return projectEvidence(session.id, session.events)
  }
}
