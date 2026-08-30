import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { LongGoalRecordV3 } from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import {
  formatGoalFirstText,
  requireLegacyV2GoalFirstRecord,
} from '../../packages/tianwen-runtime-bundle/src/goal-first-runner.js'

const GOAL_ID = 'tianwen-long-goal-abc'
const GOAL_OBJECTIVE = 'Ship the widget'

type Phase = 'active' | 'planning' | 'blocked' | 'complete'

function result(overrides: {
  phase?: Phase
  revision?: number
  action?: string
  planning?: string
} = {}) {
  return {
    schemaVersion: 'tianwen.goal-first-progress-result.v2',
    ...(overrides.action === undefined ? {} : { action: overrides.action }),
    ...(overrides.planning === undefined ? {} : { planning: overrides.planning }),
    status: {
      schemaVersion: 'tianwen.long-goal-status.v2',
      goal: {
        id: GOAL_ID,
        objective: GOAL_OBJECTIVE,
        context: null,
        successCriteria: null,
        phase: overrides.phase ?? 'active',
        revision: overrides.revision ?? 3,
        completedTasks: 1,
        abandonedTasks: 0,
        totalTasks: 3,
      },
    },
    sessionId: null,
  }
}

function terminalV3Record(phase: 'blocked' | 'complete'): LongGoalRecordV3 {
  return {
    schemaVersion: 'tianwen.long-goal.v3', id: GOAL_ID, revision: 3,
    objective: GOAL_OBJECTIVE, context: null, successCriteria: null,
    workspaceRoot: 'D:/workspace', maxTaskRounds: 3,
    planner: { sessionId: 'planner-session-1', agentPreset: 'planner', planRevision: 1, phase, consideredSettledTasks: 0 },
    guidance: [], control: { sessionId: 'continuous-control-session-1', autoProgress: 'running' },
    createdAt: 1, updatedAt: 1, tasks: [],
  }
}

describe('formatGoalFirstText next-step mapping', () => {
  it('maps the active phase to a continue command carrying the current revision', () => {
    const text = formatGoalFirstText(result({ phase: 'active', revision: 3, action: 'started' }))
    expect(text).toBe(
      `started: Goal ${GOAL_ID} [active] ${GOAL_OBJECTIVE}\n` +
        `Next: tianwen goal continue --goal ${GOAL_ID} --revision 3\n`,
    )
  })

  it('maps the planning phase to a continue command carrying the current revision', () => {
    const text = formatGoalFirstText(result({ phase: 'planning', revision: 7, planning: 'pending' }))
    expect(text).toBe(
      `pending: Goal ${GOAL_ID} [planning] ${GOAL_OBJECTIVE}\n` +
        `Next: tianwen goal continue --goal ${GOAL_ID} --revision 7\n`,
    )
  })

  it('maps the blocked phase to an abandon command carrying the current revision', () => {
    const text = formatGoalFirstText(result({ phase: 'blocked', revision: 5, action: 'blocked' }))
    expect(text).toBe(
      `blocked: Goal ${GOAL_ID} [blocked] ${GOAL_OBJECTIVE}\n` +
        `Next: tianwen goal abandon --goal ${GOAL_ID} --revision 5\n`,
    )
  })

  it('maps the complete phase to a terminal Next line with no further command', () => {
    const text = formatGoalFirstText(result({ phase: 'complete', revision: 9, action: 'complete' }))
    expect(text).toBe(
      `complete: Goal ${GOAL_ID} [complete] ${GOAL_OBJECTIVE}\nNext: complete\n`,
    )
  })

  it.each([
    ['active', 'continue'],
    ['planning', 'continue'],
    ['blocked', 'abandon'],
  ] as const)('maps the %s phase to the %s next command verb', (phase, verb) => {
    const text = formatGoalFirstText(result({ phase, revision: 12, action: 'started' }))
    expect(text).toContain(`Next: tianwen goal ${verb} --goal ${GOAL_ID} --revision 12`)
  })

  it('falls back to the updated label when neither action nor planning is present', () => {
    const text = formatGoalFirstText(result({ phase: 'active', revision: 2 }))
    expect(text).toBe(
      `updated: Goal ${GOAL_ID} [active] ${GOAL_OBJECTIVE}\n` +
        `Next: tianwen goal continue --goal ${GOAL_ID} --revision 2\n`,
    )
  })

  it('prefers action over planning when both are present', () => {
    const text = formatGoalFirstText(result({ phase: 'active', revision: 4, action: 'started', planning: 'pending' }))
    expect(text).toContain(`started: Goal ${GOAL_ID} [active] ${GOAL_OBJECTIVE}`)
  })
})

describe('legacy Goal-first runner boundary', () => {
  it.each(['blocked', 'complete'] as const)('rejects a terminal v3 %s record before continuation can return success', phase => {
    expect(() => requireLegacyV2GoalFirstRecord(terminalV3Record(phase))).toThrow('Goal-first runner supports only v2 records')
  })
})

describe('goal-first-runner JSON output branch', () => {
  const runnerSource = readFileSync(
    fileURLToPath(new URL('../../packages/tianwen-runtime-bundle/src/goal-first-runner.ts', import.meta.url)),
    'utf8',
  )

  it('serializes the raw result for JSON mode and routes only text mode through the formatter', () => {
    expect(runnerSource).toMatch(
      /process\.stdout\.write\(config\.json\s*\?\s*`\$\{JSON\.stringify\(result\)\}\\n`\s*:\s*formatGoalFirstText\(result\)\)/,
    )
  })

  it('invokes the text formatter exactly once, only in the non-JSON branch', () => {
    expect(runnerSource.match(/formatGoalFirstText\(result\)/g)).toHaveLength(1)
  })
})
