import { describe, expect, it, vi } from 'vitest'

import {
  continueLearningLoop,
  drainLearningLoopLane,
  drainLearningLoopLaneWithWake,
  runLearningLoopPhase,
} from '../../packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.js'

describe('learning-loop orchestrator', () => {
  it('admits only the exact active consented correction before starting its child', async () => {
    const start = vi.fn()
    await expect(continueLearningLoop({
      analysis: {
        analysisId: 'analysis:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        sessionId: 'main', messageId: 'reply', feedbackVersion: 'v1',
        consentRevision: 2, phase: 'pending-parent',
      },
      consent: { enabled: true, revision: 2 },
      intake: {
        state: 'active', rating: 'negative', ticketId: 'ticket:one',
        feedbackVersion: 'v1', analysisConsentRevision: 2,
      },
      start,
    })).resolves.toEqual({ state: 'analysis-started' })
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('does not start when current consent no longer covers the captured revision', async () => {
    const start = vi.fn()
    await expect(continueLearningLoop({
      analysis: {
        analysisId: 'analysis:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        sessionId: 'main', messageId: 'reply', feedbackVersion: 'v1',
        consentRevision: 2, phase: 'pending-parent',
      },
      consent: { enabled: false, revision: 3 },
      intake: {
        state: 'active', rating: 'negative', ticketId: 'ticket:one',
        feedbackVersion: 'v1', analysisConsentRevision: 2,
      },
      start,
    })).resolves.toEqual({ state: 'invalidated' })
    expect(start).not.toHaveBeenCalled()
  })
})

describe('durable learning-loop phase table', () => {
  const base = {
    analysisId: 'analysis:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ticketId: 'ticket:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sessionId: 'main',
    messageId: 'reply',
    feedbackVersion: 'v1',
    consentRevision: 2,
    parentSessionId: 'main',
    childSessionId: 'child',
    requestedAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  } as const

  it.each([
    ['failed', 'resume'],
    ['pending-parent', 'startChild'],
    ['running', 'prepareCandidate'],
    ['candidate-ready', 'evaluate'],
    ['shadow-ready', 'promote'],
    ['candidate-rejected', 'report'],
    ['promoted', 'report'],
    ['rolled-back', 'report'],
  ] as const)('resumes only the next missing work after durable %s', async (phase, expected) => {
    const calls: string[] = []
    const status = {
      ...base,
      phase,
      ...(phase === 'failed' ? { resumePhase: 'candidate-ready' as const } : {}),
      ...(phase === 'running' ? {
        submissionDigest: `sha256:${'b'.repeat(64)}` as const,
        submission: { verdict: 'skill-change' as const },
      } : {}),
    }
    const op = (name: string, result?: unknown) => async () => {
      calls.push(name)
      return result
    }
    await runLearningLoopPhase({
      status,
      hasActiveSupport: op('support', true),
      resume: op('resume'),
      startChild: op('startChild'),
      freezeProtocol: op('freezeProtocol', { provenance: 'pre-candidate' }),
      materializeCandidate: op('prepareCandidate'),
      evaluate: op('evaluate'),
      promote: op('promote'),
      rollback: op('rollback'),
      report: op('report'),
      interruptChild: op('interruptChild'),
    })
    expect(calls).toEqual(['support', expected === 'prepareCandidate'
      ? 'freezeProtocol'
      : expected, ...(expected === 'prepareCandidate' ? ['prepareCandidate'] : [])])
  })

  it('freezes an audited pre-Candidate protocol before materialization without Candidate input', async () => {
    const order: string[] = []
    const status = {
      ...base,
      phase: 'running' as const,
      submissionDigest: `sha256:${'b'.repeat(64)}` as const,
      submission: { verdict: 'skill-change' as const },
    }
    await runLearningLoopPhase({
      status,
      hasActiveSupport: async () => true,
      freezeProtocol: async received => {
        order.push(`protocol:${Object.keys(received).toSorted().join(',')}`)
        return { provenance: 'pre-candidate' }
      },
      materializeCandidate: async () => { order.push('candidate') },
    })
    expect(order).toEqual([
      'protocol:analysisId,childSessionId,consentRevision,feedbackVersion,messageId,parentSessionId,phase,requestedAt,sessionId,submission,submissionDigest,ticketId,updatedAt',
      'candidate',
    ])
  })

  it('still rejects a post-Candidate retrospective protocol', async () => {
    const materializeCandidate = vi.fn()
    await expect(runLearningLoopPhase({
      status: {
        ...base,
        phase: 'running',
        submissionDigest: `sha256:${'b'.repeat(64)}`,
        submission: { verdict: 'skill-change' },
      },
      hasActiveSupport: async () => true,
      freezeProtocol: async () => ({ provenance: 'retrospective' }),
      materializeCandidate,
    })).rejects.toThrow(/pre-candidate/u)
    expect(materializeCandidate).not.toHaveBeenCalled()
  })

  it('interrupts unsupported native work and rolls back only a promoted analysis', async () => {
    const interruptChild = vi.fn()
    const rollback = vi.fn()
    await runLearningLoopPhase({
      status: { ...base, phase: 'running' },
      hasActiveSupport: async () => false,
      interruptChild,
      rollback,
    })
    expect(interruptChild).toHaveBeenCalledTimes(1)
    expect(rollback).not.toHaveBeenCalled()

    interruptChild.mockClear()
    await runLearningLoopPhase({
      status: { ...base, phase: 'promoted' },
      hasActiveSupport: async () => false,
      interruptChild,
      rollback,
    })
    expect(interruptChild).not.toHaveBeenCalled()
    expect(rollback).toHaveBeenCalledTimes(1)
  })

  it('records an infrastructure failure at the current durable phase instead of bypassing a gate', async () => {
    const fail = vi.fn()
    await expect(runLearningLoopPhase({
      status: { ...base, phase: 'candidate-ready' },
      hasActiveSupport: async () => true,
      evaluate: async () => { throw new Error('verification fixture unavailable') },
      fail,
    })).resolves.toBeUndefined()
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({
      analysisId: base.analysisId,
      phase: 'candidate-ready',
    }))
  })

  it('resumes a failed promoted outcome before a withdrawn-support rollback', async () => {
    const resume = vi.fn()
    const rollback = vi.fn()
    const invalidate = vi.fn()
    await runLearningLoopPhase({
      status: { ...base, phase: 'failed', resumePhase: 'promoted' },
      hasActiveSupport: async () => false,
      resume, rollback, invalidate,
    })
    expect(resume).toHaveBeenCalledOnce()
    expect(rollback).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()

    await runLearningLoopPhase({
      status: { ...base, phase: 'promoted' },
      hasActiveSupport: async () => false,
      resume, rollback, invalidate,
    })
    expect(rollback).toHaveBeenCalledOnce()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('invalidates unsupported Shadow work when no verified promote can be recovered', async () => {
    const recoverPromote = vi.fn(async () => false)
    const invalidate = vi.fn()
    await runLearningLoopPhase({
      status: { ...base, phase: 'shadow-ready', shadowId: 'shadow:one' },
      hasActiveSupport: async () => false,
      recoverPromote,
      invalidate,
      interruptChild: vi.fn(),
    })
    expect(recoverPromote).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('stops on a newly durable failure, then retries its exact phase on the next wake', async () => {
    let status = { ...base, phase: 'candidate-ready' }
    let evaluations = 0
    let resumes = 0
    const advance = async (current: typeof status) => {
      await runLearningLoopPhase({
        status: current,
        hasActiveSupport: async () => true,
        evaluate: async () => {
          evaluations += 1
          throw new Error('temporary verifier outage')
        },
        fail: failed => { status = { ...base, phase: 'failed', resumePhase: failed.phase } },
        resume: failed => {
          resumes += 1
          status = { ...base, phase: failed.resumePhase! }
        },
      })
    }
    await drainLearningLoopLane({ read: () => status, advance })
    expect({ evaluations, resumes, phase: status.phase }).toEqual({ evaluations: 1, resumes: 0, phase: 'failed' })
    await drainLearningLoopLane({ read: () => status, advance })
    expect({ evaluations, resumes, phase: status.phase }).toEqual({ evaluations: 2, resumes: 1, phase: 'failed' })
  })

  it('continues from one durable feedback submission through every changed phase', async () => {
    const phases = ['running', 'candidate-ready', 'shadow-ready', 'promoted']
    let index = 0
    const advanced: string[] = []
    await drainLearningLoopLane({
      read: () => phases[index] === undefined ? undefined : {
        ...base, phase: phases[index]!, revision: index,
      },
      advance: status => { advanced.push(status.phase); index += 1 },
    })
    expect(advanced).toEqual(['running', 'candidate-ready', 'shadow-ready', 'promoted'])
  })

  it('does not lose a support-withdrawal wake that races the last lane read', async () => {
    let wake = false
    let phase = 'promoted'
    let advances = 0
    await drainLearningLoopLaneWithWake({
      read: () => ({ ...base, phase }),
      advance: async () => {
        advances += 1
        if (advances === 1) wake = true // retraction arrives after the final support check
        else phase = 'rolled-back'
      },
      takeWake: () => {
        const result = wake
        wake = false
        return result
      },
    })
    expect(advances).toBe(3)
    expect(phase).toBe('rolled-back')
  })
})
