import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import { TIANWEN_CONTROLLED_AGENT_PRESET } from '@tianwen/runtime'

export const inject = ['workspaceRegistry', 'sessions', 'sessionPersistence'] as const

export async function apply(ctx: Context): Promise<void> {
  const archive = async (header: SessionHeader): Promise<void> => {
    if (header.agentPreset !== TIANWEN_CONTROLLED_AGENT_PRESET
      || header.origin === 'subagent'
      || header.parentSession !== undefined) return
    try {
      // Native display-only archival retains the complete Session and its identity.
      await ctx.workspaceRegistry.archiveSession(header.id)
    } catch (error) {
      // A presentation failure must not prevent the actual learning work.
      ctx.logger('tianwen-learning').warn('Internal Session remains visible: %s', error)
    }
  }
  ctx.on('session/created', session => archive(session.header))
  for (const session of ctx.sessions.list()) await archive(session.header)
  try {
    for (const header of await ctx.sessionPersistence.list()) await archive(header)
  } catch (error) {
    ctx.logger('tianwen-learning').warn('Internal Session history could not be archived: %s', error)
  }
}
