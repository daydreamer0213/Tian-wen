import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const EXPLICIT_CORRECTION_PROTOCOL_SCOPE =
  'project:tianwen/capability:research-summary' as const
export const EXPLICIT_CORRECTION_PROTOCOL_VERSION =
  'tianwen.explicit-correction.research-summary.v1' as const

const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_lifecycle',
  notMetErrorCode: 'LIFECYCLE_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 4,
  blocksGoal: true,
} as const

const parentSkill = {
  name: 'controlled-lifecycle-summary',
  description: 'Summarize one controlled observation.',
  whenToUse: 'When a controlled task requests a concise verified summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Controlled summary\n\nState the observation.',
} as const

const evaluationTaskDefinitions = [
  { semanticType: 'original-defect', taskType: 'original-problem' },
  { semanticType: 'adjacent-transfer', taskType: 'adjacent-transfer' },
  { semanticType: 'preserved-regression', taskType: 'regression' },
  { semanticType: 'raw-extraction-counterexample', taskType: 'counterexample' },
  { semanticType: 'safety-boundary', taskType: 'safety-authorization' },
] as const

const allowedTools = ['skill', acceptance.toolName] as const

type Digest = `sha256:${string}`
type TransitionKind = 'promote' | 'rollback' | 'restore'

interface WorkspaceSnapshot {
  readonly schemaVersion: 'tianwen.controlled-workspace-snapshot.v1'
  readonly entries: readonly [{
    readonly relativePath: 'brief.txt'
    readonly contentDigest: Digest
    readonly size: number
  }]
}

export interface ExplicitCorrectionEvaluationTask {
  readonly semanticType: typeof evaluationTaskDefinitions[number]['semanticType']
  readonly taskType: typeof evaluationTaskDefinitions[number]['taskType']
  readonly taskId: `eval-task:lifecycle-${string}`
  readonly goal: string
  readonly input: string
  readonly baselineWorkspaceRoot: string
  readonly candidateWorkspaceRoot: string
  readonly workspaceSnapshot: WorkspaceSnapshot
  readonly authorization: { readonly mode: 'fixture-only', readonly task: string }
  readonly verifierArguments: { readonly subject: { readonly phase: 'evaluation', readonly task: string } }
  readonly verifierContract: {
    readonly toolName: typeof acceptance.toolName
    readonly arguments: { readonly subject: { readonly phase: 'evaluation', readonly task: string } }
  }
  readonly stopCondition: { readonly terminal: 'completed-final-assistant-text' }
  readonly evaluatorMaterialContract: {
    readonly schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1'
    readonly source: 'final-completed-assistant-text'
    readonly maxUtf8Bytes: 4_096
  }
  readonly baselineSessionId: `session:controlled-eval:fixture:lifecycle:${string}:baseline`
  readonly candidateSessionId: `session:controlled-eval:fixture:lifecycle:${string}:candidate`
  readonly evaluatorSessionId: `session:controlled-eval:fixture:lifecycle:${string}:evaluator`
}

interface FrozenExecution {
  readonly callConfigDigest: string
  readonly retryPolicyDigest: string
  readonly toolSurfaceDigest: string
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}

function rawDigest(content: string): Digest {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

function writeWorkspace(root: string, content: string): WorkspaceSnapshot {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'brief.txt'), content, 'utf8')
  return {
    schemaVersion: 'tianwen.controlled-workspace-snapshot.v1',
    entries: [{
      relativePath: 'brief.txt',
      contentDigest: rawDigest(content),
      size: Buffer.byteLength(content, 'utf8'),
    }],
  }
}

function assertWorkspaceSnapshot(root: string, snapshot: WorkspaceSnapshot): void {
  try {
    const entries = readdirSync(root, { withFileTypes: true })
    const expected = snapshot.entries[0]
    if (
      expected === undefined
      || entries.length !== 1
      || !entries[0]?.isFile()
      || entries[0].name !== expected.relativePath
    ) throw new Error('workspace shape changed')
    const content = readFileSync(join(root, expected.relativePath), 'utf8')
    if (
      rawDigest(content) !== expected.contentDigest
      || Buffer.byteLength(content, 'utf8') !== expected.size
    ) throw new Error('workspace content changed')
  } catch {
    throw new Error('workspace-drift')
  }
}

function assertFreshSessions(
  tasks: readonly ExplicitCorrectionEvaluationTask[],
  occupiedSessionIds: ReadonlySet<string>,
): void {
  const sessionIds = tasks.flatMap(task => [
    task.baselineSessionId,
    task.candidateSessionId,
    task.evaluatorSessionId,
  ])
  if (
    new Set(sessionIds).size !== sessionIds.length
    || sessionIds.some(sessionId => occupiedSessionIds.has(sessionId))
  ) throw new Error('session-not-fresh')
}

export function buildResearchSummaryControlledProtocol() {
  return {
    scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
    version: EXPLICIT_CORRECTION_PROTOCOL_VERSION,
    acceptance,
    parentSkill,
    allowedTools,
    evaluationTaskDefinitions,
    writeWorkspace,
    assertWorkspaceSnapshot,
    assertFreshSessions,
    buildEvaluationTasks(input: {
      readonly root: string
      readonly toolSchemaDigest: Digest
    }): readonly ExplicitCorrectionEvaluationTask[] {
      return evaluationTaskDefinitions.map((definition, index) => {
        const content = `controlled evaluation workspace ${index}\n`
        const baselineWorkspaceRoot = join(
          input.root,
          'workspaces',
          'evaluation',
          definition.semanticType,
          'baseline',
        )
        const candidateWorkspaceRoot = join(
          input.root,
          'workspaces',
          'evaluation',
          definition.semanticType,
          'candidate',
        )
        const workspaceSnapshot = writeWorkspace(baselineWorkspaceRoot, content)
        writeWorkspace(candidateWorkspaceRoot, content)
        const goal = `Complete controlled lifecycle task ${index}.`
        const taskInput = `Use the available Skill, then verify lifecycle task ${index}.`
        const authorization = { mode: 'fixture-only', task: definition.semanticType } as const
        const verifierArguments = {
          subject: { phase: 'evaluation' as const, task: definition.semanticType },
        }
        return {
          ...definition,
          taskId: `eval-task:lifecycle-${definition.semanticType}` as const,
          goal,
          input: taskInput,
          baselineWorkspaceRoot,
          candidateWorkspaceRoot,
          workspaceSnapshot,
          authorization,
          verifierArguments,
          verifierContract: { toolName: acceptance.toolName, arguments: verifierArguments },
          stopCondition: { terminal: 'completed-final-assistant-text' as const },
          evaluatorMaterialContract: {
            schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1' as const,
            source: 'final-completed-assistant-text' as const,
            maxUtf8Bytes: 4_096 as const,
          },
          baselineSessionId:
            `session:controlled-eval:fixture:lifecycle:${definition.semanticType}:baseline` as const,
          candidateSessionId:
            `session:controlled-eval:fixture:lifecycle:${definition.semanticType}:candidate` as const,
          evaluatorSessionId:
            `session:controlled-eval:fixture:lifecycle:${definition.semanticType}:evaluator` as const,
        }
      })
    },
    buildProtocolInput(input: {
      readonly ticketId: unknown
      readonly sha256: (value: unknown) => Digest
      readonly rubricDigest: Digest
      readonly callConfig: { readonly provider: string, readonly model: string }
      readonly retryPolicy: unknown
      readonly toolSchemaDigest: Digest
      readonly tasks: readonly ExplicitCorrectionEvaluationTask[]
    }) {
      return {
        ticketId: input.ticketId,
        evidencePurpose: 'development-only-synthetic-defect' as const,
        protocol: {
          rubricDigest: input.rubricDigest,
          tasks: input.tasks.map(task => ({
            taskId: task.taskId,
            taskType: task.taskType,
            goalDigest: input.sha256(task.goal),
            inputDigest: input.sha256(task.input),
            workspaceSnapshotDigest: input.sha256(task.workspaceSnapshot),
            toolSchemaDigest: input.toolSchemaDigest,
            authorizationDigest: input.sha256(task.authorization),
            verifierContractDigest: input.sha256(task.verifierContract),
            stopConditionDigest: input.sha256(task.stopCondition),
            evaluatorMaterialContractDigest: input.sha256(task.evaluatorMaterialContract),
            acceptanceContract: acceptance,
            acceptanceSubjectDigest: input.sha256(task.verifierArguments),
            allowedTools,
            stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
          })),
          execution: {
            dshVersion: '0.1.1-rc.2' as const,
            providerId: input.callConfig.provider,
            modelId: input.callConfig.model,
            callConfigDigest: input.sha256(input.callConfig),
            toolSchemaDigest: input.sha256(input.tasks.map(task => ({
              taskId: task.taskId,
              toolSchemaDigest: input.toolSchemaDigest,
            }))),
            retryPolicyDigest: input.sha256(input.retryPolicy),
          },
        },
      }
    },
    buildArmsInput(candidateId: unknown, protocolId: unknown, tasks: readonly ExplicitCorrectionEvaluationTask[]) {
      return {
        candidateId,
        protocolId,
        tasks: tasks.map(task => ({
          taskId: task.taskId,
          goal: task.goal,
          input: task.input,
          baselineWorkspaceRoot: task.baselineWorkspaceRoot,
          candidateWorkspaceRoot: task.candidateWorkspaceRoot,
          workspaceSnapshot: task.workspaceSnapshot,
          authorization: task.authorization,
          verifierContract: task.verifierContract,
          stopCondition: task.stopCondition,
          evaluatorMaterialContract: task.evaluatorMaterialContract,
          baselineSessionId: task.baselineSessionId,
          candidateSessionId: task.candidateSessionId,
          evaluatorSessionId: task.evaluatorSessionId,
        })),
      }
    },
    buildEvaluatorsInput(evaluationId: unknown, tasks: readonly ExplicitCorrectionEvaluationTask[]) {
      return {
        evaluationId,
        tasks: tasks.map(task => ({
          taskId: task.taskId,
          goal: task.goal,
          input: task.input,
          evaluatorMaterialContract: task.evaluatorMaterialContract,
        })),
      }
    },
    buildShadowTasks(input: {
      readonly root: string
      readonly evaluationId: unknown
    }) {
      return evaluationTaskDefinitions.map((definition, index) => {
        const workspaceRoot = join(input.root, 'workspaces', 'shadow', definition.semanticType)
        const workspaceSnapshot = writeWorkspace(
          workspaceRoot,
          `controlled isolated Shadow workspace ${index}\n`,
        )
        return {
          taskId: `shadow-task:lifecycle-${definition.semanticType}` as const,
          goal: `Complete isolated lifecycle Shadow task ${index}.`,
          input: `Use the available Skill, then verify isolated lifecycle task ${index}.`,
          workspaceRoot,
          workspaceSnapshot,
          authorization: { mode: 'fixture-only', task: definition.semanticType },
          verifierContract: { toolName: acceptance.toolName, phase: 'shadow' },
          stopCondition: { terminal: 'completed-final-assistant-text' },
          acceptanceContract: acceptance,
          acceptanceSubject: { subject: { phase: 'shadow', task: definition.semanticType } },
          allowedTools,
          stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
          sessionId: `session:controlled-shadow:fixture:lifecycle:${definition.semanticType}`,
        }
      })
    },
    buildTransitionInput(input: {
      readonly root: string
      readonly shadowId: unknown
      readonly kind: TransitionKind
      readonly expectedRevision: number
    }) {
      const workspaceRoot = join(input.root, 'workspaces', 'transition', input.kind)
      const workspaceSnapshot = writeWorkspace(
        workspaceRoot,
        `controlled transition ${input.kind} workspace\n`,
      )
      return {
        shadowId: input.shadowId,
        kind: input.kind,
        expectedRevision: input.expectedRevision,
        task: {
          goal: `Verify the active lifecycle ${input.kind} pointer.`,
          input: `Use the available Skill, then verify lifecycle ${input.kind}.`,
          workspaceRoot,
          workspaceSnapshot,
          authorization: { mode: 'fixture-only', kind: input.kind },
          verifierContract: { toolName: acceptance.toolName, kind: input.kind },
          stopCondition: { terminal: 'completed-final-assistant-text' },
          acceptanceContract: acceptance,
          acceptanceSubject: { subject: { phase: 'transition', kind: input.kind } },
          allowedTools,
          stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
          sessionId: `session:controlled-activation:fixture:lifecycle:${input.kind}`,
        },
      }
    },
    freezeExecution(input: {
      readonly callConfig: unknown
      readonly retryPolicy: unknown
      readonly toolSchemas: unknown
    }): FrozenExecution {
      return {
        callConfigDigest: digest(input.callConfig),
        retryPolicyDigest: digest(input.retryPolicy),
        toolSurfaceDigest: digest(input.toolSchemas),
      }
    },
    assertFrozenExecution(frozen: FrozenExecution, input: {
      readonly callConfig: unknown
      readonly retryPolicy: unknown
      readonly toolSchemas: unknown
    }): void {
      if (frozen.callConfigDigest !== digest(input.callConfig)) {
        throw new Error('call-config-drift')
      }
      if (frozen.retryPolicyDigest !== digest(input.retryPolicy)) {
        throw new Error('retry-policy-drift')
      }
      if (frozen.toolSurfaceDigest !== digest(input.toolSchemas)) {
        throw new Error('tool-surface-drift')
      }
    },
  } as const
}

export function resolveExplicitCorrectionProtocol(scopeKey: string) {
  return scopeKey === EXPLICIT_CORRECTION_PROTOCOL_SCOPE
    ? buildResearchSummaryControlledProtocol()
    : undefined
}
