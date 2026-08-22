import { describe, expect, it } from 'vitest'
import type {
  LearningTicket,
  OutcomeLearningSignal,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  prepareControlledSkillEvalProtocol,
} from '../../packages/tianwen-evolution/src/index.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'

const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

const taskTypes = [
  'original-problem',
  'adjacent-transfer',
  'regression',
  'counterexample',
  'safety-authorization',
] as const

function digest(value: string) {
  return sha256(value)
}

function ticketFacts(scopeKey = 'project:tianwen/capability:research-summary') {
  const signals = ['first', 'second'].map((suffix): OutcomeLearningSignal => ({
    signalId: `signal:${suffix}`,
    ingestionId: digest(`ingestion:${suffix}`),
    runId: `run:${digest(`run:${suffix}`).slice('sha256:'.length)}`,
    sessionId: `session:${suffix}`,
    scopeKey,
    problemFingerprint: digest('shared-problem'),
    problemCategory: 'summary-omits-required-result',
    failureSignature: digest(`failure:${suffix}`),
    severity: 2,
    blocksGoal: false,
    sessionDigest: digest(`session:${suffix}`),
    evidenceIds: [digest(`evidence:${suffix}`)],
  }))
  const ticket: LearningTicket = {
    ticketId: 'ticket:controlled-evaluation',
    problemFingerprint: digest('shared-problem'),
    status: 'open',
    signalIds: signals.map(signal => signal.signalId),
  }
  return { ticket, signals }
}

function controlledProtocol() {
  return {
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    tasks: taskTypes.map((taskType, index) => ({
      taskId: `eval-task:${taskType}`,
      taskType,
      goalDigest: digest(`goal:${index}`),
      inputDigest: digest(`input:${index}`),
      workspaceSnapshotDigest: digest(`workspace:${index}`),
      toolSchemaDigest: digest(`tools:${index}`),
      authorizationDigest: digest(`authorization:${index}`),
      verifierContractDigest: digest(`verifier:${index}`),
      stopConditionDigest: digest(`stop:${index}`),
      evaluatorMaterialContractDigest: digest(`evaluator-material:${index}`),
      acceptanceContract: acceptance,
      acceptanceSubjectDigest: digest(`subject:${index}`),
      allowedTools: ['skill', 'verify_summary'],
      limits: {
        maxModelRequests: 3,
        maxToolCalls: 4,
        maxElapsedMs: 10_000,
      },
    })),
    execution: {
      dshVersion: '0.1.0-rc.7',
      providerId: 'tianwen-v0.1-eval-scripted',
      modelId: 'scripted',
      callConfigDigest: digest('call-config'),
      toolSchemaDigest: digest('visible-tools'),
      retryPolicyDigest: digest('no-retry'),
    },
  } as const
}

describe('controlled five-task Skill evaluation protocol', () => {
  it('derives one deterministic development-only protocol with permanent evidence labels', () => {
    const { ticket, signals } = ticketFacts()
    const input = {
      ticketId: ticket.ticketId,
      evidencePurpose: 'development-only-synthetic-defect',
      protocol: controlledProtocol(),
    } as const

    const first = prepareControlledSkillEvalProtocol(input, ticket, signals, 'pre-candidate')
    const replay = prepareControlledSkillEvalProtocol(
      structuredClone(input),
      structuredClone(ticket),
      structuredClone(signals),
      'pre-candidate',
    )

    expect(replay).toEqual(first)
    expect(first).toMatchObject({
      schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
      ticketId: ticket.ticketId,
      scopeKey: 'project:tianwen/capability:research-summary',
      provenance: 'pre-candidate',
      evidencePurpose: 'development-only-synthetic-defect',
      evidenceLabels: ['development-only', 'synthetic-defect'],
    })
    expect(first.protocolId).toMatch(/^eval-protocol:[a-f0-9]{64}$/u)
    expect(first.protocol.tasks.map(task => task.taskType)).toEqual(taskTypes)
  })

  it('keeps controlled product evidence unlabeled instead of inheriting synthetic proof', () => {
    const { ticket, signals } = ticketFacts()
    const prepared = prepareControlledSkillEvalProtocol({
      ticketId: ticket.ticketId,
      evidencePurpose: 'controlled-product',
      protocol: controlledProtocol(),
    }, ticket, signals, 'pre-candidate')

    expect(prepared.evidencePurpose).toBe('controlled-product')
    expect(prepared.evidenceLabels).toEqual([])
  })

  it('rejects a changed rubric, incomplete matrix, extra raw prompt, or mismatched Ticket scope', () => {
    const { ticket, signals } = ticketFacts()
    const valid = {
      ticketId: ticket.ticketId,
      evidencePurpose: 'controlled-product',
      protocol: controlledProtocol(),
    } as const
    const changedRubric = structuredClone(valid)
    changedRubric.protocol.rubricDigest = digest('caller-rubric')
    const incomplete = structuredClone(valid)
    incomplete.protocol.tasks.pop()
    const rawPrompt = structuredClone(valid) as unknown as Record<string, unknown>
    ;(rawPrompt.protocol as { tasks: Array<Record<string, unknown>> }).tasks[0]!.prompt = 'private task text'

    expect(() => prepareControlledSkillEvalProtocol(changedRubric, ticket, signals, 'pre-candidate'))
      .toThrow(/rubric/i)
    expect(() => prepareControlledSkillEvalProtocol(incomplete, ticket, signals, 'pre-candidate'))
      .toThrow(/five tasks/i)
    expect(() => prepareControlledSkillEvalProtocol(rawPrompt as never, ticket, signals, 'pre-candidate'))
      .toThrow(/unexpected field/i)
    expect(() => prepareControlledSkillEvalProtocol(valid, ticket, [
      signals[0]!,
      { ...signals[1]!, scopeKey: 'project:another-scope' },
    ], 'pre-candidate')).toThrow(/scope/i)
  })

  it('rejects duplicate tools, unsafe execution identifiers, and unbounded limits', () => {
    const { ticket, signals } = ticketFacts()
    const base = {
      ticketId: ticket.ticketId,
      evidencePurpose: 'controlled-product',
      protocol: controlledProtocol(),
    } as const
    const duplicateTools = structuredClone(base)
    duplicateTools.protocol.tasks[0]!.allowedTools = ['skill', 'skill']
    const unsafeProvider = structuredClone(base)
    unsafeProvider.protocol.execution.providerId = 'https://provider.invalid?token=secret'
    const unbounded = structuredClone(base)
    unbounded.protocol.tasks[0]!.limits.maxModelRequests = 10_000

    expect(() => prepareControlledSkillEvalProtocol(duplicateTools, ticket, signals, 'pre-candidate'))
      .toThrow(/allowed tools/i)
    expect(() => prepareControlledSkillEvalProtocol(unsafeProvider, ticket, signals, 'pre-candidate'))
      .toThrow(/providerId/i)
    expect(() => prepareControlledSkillEvalProtocol(unbounded, ticket, signals, 'pre-candidate'))
      .toThrow(/maxModelRequests/i)
  })
})
