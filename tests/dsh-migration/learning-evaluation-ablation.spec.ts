import { describe, expect, it } from 'vitest'

import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import {
  EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
  resolveExplicitCorrectionProtocol,
} from '../../packages/tianwen-runtime-bundle/src/explicit-correction-protocol.js'

describe('production learning evaluation ablation', () => {
  it('keeps thirteen evidence-owning controlled Runs with one unseen holdout', () => {
    const protocol = resolveExplicitCorrectionProtocol(
      EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
    )!
    const materializeWorkspace = () => {}
    const tasks = protocol.buildEvaluationTasks({
      root: 'D:/DevData/tianwen-probe-task7/ablation',
      materializeWorkspace,
      sessionNamespace: 'ablation',
    })
    const shadow = protocol.buildShadowTasks({
      root: 'D:/DevData/tianwen-probe-task7/ablation',
      materializeWorkspace,
      sessionNamespace: 'ablation',
    })
    const pairedPacketDigests = tasks.map(task => sha256(task.packet))
    const evaluatorRuns = new Set(tasks.map(task => task.evaluatorSessionId)).size
    const runCounts = {
      arms: tasks.length * 2,
      evaluators: evaluatorRuns,
      shadow: shadow.length,
      activation: 1,
    }

    expect(runCounts).toEqual({
      arms: 10,
      evaluators: 1,
      shadow: 1,
      activation: 1,
    })
    expect(Object.values(runCounts).reduce((sum, count) => sum + count, 0))
      .toBe(13)
    expect(pairedPacketDigests).not.toContain(sha256(shadow[0]!.acceptanceSubject))
  })
})
